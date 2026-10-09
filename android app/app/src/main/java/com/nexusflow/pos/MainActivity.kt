package com.nexusflow.pos

import android.Manifest
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.view.Gravity
import android.view.View
import android.webkit.*
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

data class DiscoveredServer(
    val name: String,
    val url: String,
    val latency: Long
)

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val CAMERA_PERMISSION_CODE = 1001
    private val FILE_CHOOSER_REQUEST_CODE = 1002
    private var pendingPermissionRequest: PermissionRequest? = null
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var cameraPhotoUri: Uri? = null
    private var cameraPhotoFile: File? = null
    private val executor = Executors.newFixedThreadPool(20)
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Enforce screenshot and screen-recording blocking by default
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)

        // Make the POS layout full screen and immersive
        enableImmersiveMode()

        webView = findViewById(R.id.webView)
        setupWebView()

        // Get saved POS Server IP address or prompt / auto-discover on first launch
        val sharedPref = getPreferences(Context.MODE_PRIVATE)
        val savedIp = sharedPref.getString("pos_server_ip", null)

        if (savedIp != null) {
            loadServerUrl(savedIp)
        } else {
            promptForServerIp()
        }
    }

    private fun enableImmersiveMode() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_FULLSCREEN
        )
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enableImmersiveMode()
        }
    }

    private fun loadServerUrl(rawAddress: String) {
        var target = rawAddress.trim()
        if (!target.startsWith("http://") && !target.startsWith("https://")) {
            target = if (target.contains(":")) {
                "http://$target"
            } else {
                "http://$target:3000"
            }
        }
        webView.loadUrl(target)
    }

    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW

        // Force hardware acceleration for modern glassmorphism graphics performance and camera video
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)

        // Mount JavaScript bridge for screen capture security flags and server management
        webView.addJavascriptInterface(WebAppInterface(this), "Android")

        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    mainHandler.post {
                        Toast.makeText(this@MainActivity, "Connection lost to POS server.", Toast.LENGTH_SHORT).show()
                        promptForServerIp("POS Server unreachable. Please select or verify the server address:")
                    }
                }
            }

            override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
                // In local dev/LAN environment with self-signed SSL certs for WebRTC getUserMedia,
                // proceed so live camera streaming works seamlessly without security rejections.
                handler?.proceed()
            }
        }

        // WebChromeClient handles console logs, alerts, and camera permission requests in WebView
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val requestedResources = request.resources
                    if (requestedResources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                        pendingPermissionRequest = request
                        if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA)
                            == PackageManager.PERMISSION_GRANTED) {
                            request.grant(requestedResources)
                            pendingPermissionRequest = null
                        } else {
                            ActivityCompat.requestPermissions(
                                this@MainActivity,
                                arrayOf(Manifest.permission.CAMERA),
                                CAMERA_PERMISSION_CODE
                            )
                        }
                    } else {
                        request.grant(requestedResources)
                    }
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback

                // Check camera permission
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA)
                    != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(
                        this@MainActivity,
                        arrayOf(Manifest.permission.CAMERA),
                        CAMERA_PERMISSION_CODE
                    )
                }

                // Prepare camera capture target file with FileProvider
                var photoUri: Uri? = null
                var photoFile: File? = null
                try {
                    val storageDir = cacheDir
                    photoFile = File.createTempFile("pos_camera_", ".jpg", storageDir)
                    photoUri = FileProvider.getUriForFile(
                        this@MainActivity,
                        "${applicationContext.packageName}.fileprovider",
                        photoFile
                    )
                } catch (e: Exception) {
                    e.printStackTrace()
                }

                cameraPhotoUri = photoUri
                cameraPhotoFile = photoFile

                val takePictureIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                    if (photoUri != null) {
                        putExtra(MediaStore.EXTRA_OUTPUT, photoUri)
                        addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                }

                val contentSelectionIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "image/*"
                }

                val canTakePhoto = takePictureIntent.resolveActivity(packageManager) != null && photoUri != null
                val isDirectCapture = fileChooserParams?.isCaptureEnabled == true

                if (isDirectCapture && canTakePhoto) {
                    return try {
                        startActivityForResult(takePictureIntent, FILE_CHOOSER_REQUEST_CODE)
                        true
                    } catch (e: Exception) {
                        fileChooserCallback?.onReceiveValue(null)
                        fileChooserCallback = null
                        false
                    }
                }

                val intentArray: Array<Intent> = if (canTakePhoto) {
                    arrayOf(takePictureIntent)
                } else {
                    emptyArray()
                }

                val chooserIntent = Intent(Intent.ACTION_CHOOSER).apply {
                    putExtra(Intent.EXTRA_INTENT, contentSelectionIntent)
                    putExtra(Intent.EXTRA_TITLE, "Select or Take Product Photo")
                    if (intentArray.isNotEmpty()) {
                        putExtra(Intent.EXTRA_INITIAL_INTENTS, intentArray)
                    }
                }

                return try {
                    startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST_CODE)
                    true
                } catch (e: Exception) {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = null
                    false
                }
            }
        }
    }

    /**
     * Shows the Server Configuration dialog with active LAN Auto-Discovery
     */
    fun promptForServerIp(customMessage: String? = null) {
        val sharedPref = getPreferences(Context.MODE_PRIVATE)
        val lastIp = sharedPref.getString("pos_server_ip", "")

        val builder = AlertDialog.Builder(this)
        builder.setTitle("Connect to POS Server")

        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 24, 48, 16)
        }

        // Subtitle / message
        val msgView = TextView(this).apply {
            text = customMessage ?: "Searching for NexusFlow POS Servers on local network..."
            setTextColor(Color.parseColor("#475569"))
            textSize = 13f
            setPadding(0, 0, 0, 16)
        }
        rootLayout.addView(msgView)

        // Discovered servers section container
        val discoveredContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, 0, 0, 16)
        }
        rootLayout.addView(discoveredContainer)

        // Progress bar indicator
        val progressLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, 16)
        }
        val progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleSmall)
        val progressText = TextView(this).apply {
            text = " Scanning Wi-Fi subnet..."
            textSize = 12f
            setTextColor(Color.parseColor("#64748b"))
        }
        progressLayout.addView(progressBar)
        progressLayout.addView(progressText)
        rootLayout.addView(progressLayout)

        // Manual Input Section Label
        val manualLabel = TextView(this).apply {
            text = "Or enter Server IP manually:"
            textSize = 12f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#1e293b"))
            setPadding(0, 8, 0, 8)
        }
        rootLayout.addView(manualLabel)

        val input = EditText(this).apply {
            hint = "192.168.1.100 or localhost:3000"
            setText(lastIp)
            setSingleLine(true)
        }
        rootLayout.addView(input)

        // Helper quick connect buttons
        val quickBtnLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 8, 0, 8)
        }
        val emulatorBtn = Button(this).apply {
            text = "Emulator (10.0.2.2)"
            textSize = 11f
            setOnClickListener {
                input.setText("10.0.2.2:3000")
            }
        }
        val rescanBtn = Button(this).apply {
            text = "Re-scan LAN"
            textSize = 11f
        }
        quickBtnLayout.addView(emulatorBtn)
        quickBtnLayout.addView(rescanBtn)
        rootLayout.addView(quickBtnLayout)

        builder.setView(rootLayout)

        var dialogRef: AlertDialog? = null

        fun connectToAddress(address: String) {
            val trimmed = address.trim()
            if (trimmed.isNotEmpty()) {
                with(sharedPref.edit()) {
                    putString("pos_server_ip", trimmed)
                    apply()
                }
                loadServerUrl(trimmed)
                Toast.makeText(this@MainActivity, "Connecting to $trimmed...", Toast.LENGTH_SHORT).show()
                dialogRef?.dismiss()
            } else {
                Toast.makeText(this@MainActivity, "Server address cannot be empty", Toast.LENGTH_SHORT).show()
            }
        }

        builder.setPositiveButton("Connect") { _, _ ->
            connectToAddress(input.text.toString())
        }

        builder.setNegativeButton("Cancel") { d, _ ->
            d.dismiss()
        }

        builder.setCancelable(true)
        dialogRef = builder.create()
        dialogRef.show()

        // Background LAN Discovery scanner
        fun startDiscovery() {
            discoveredContainer.removeAllViews()
            progressLayout.visibility = View.VISIBLE
            progressText.text = " Scanning Wi-Fi subnet..."

            val discoveredMap = ConcurrentHashMap<String, DiscoveredServer>()

            fun onServerDiscovered(server: DiscoveredServer) {
                if (discoveredMap.putIfAbsent(server.url, server) == null) {
                    mainHandler.post {
                        val card = Button(this@MainActivity).apply {
                            text = "🟢 ${server.name}\n   ${server.url} (${server.latency}ms)"
                            textSize = 12f
                            gravity = Gravity.START or Gravity.CENTER_VERTICAL
                            setBackgroundColor(Color.parseColor("#f0fdf4"))
                            setTextColor(Color.parseColor("#166534"))
                            setOnClickListener {
                                connectToAddress(server.url)
                            }
                        }
                        val lp = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                        ).apply {
                            setMargins(0, 4, 0, 4)
                        }
                        card.layoutParams = lp
                        discoveredContainer.addView(card)
                        progressText.text = " Found ${discoveredMap.size} active POS server(s)"
                    }
                }
            }

            // 1. UDP Broadcast discovery
            executor.execute {
                try {
                    val socket = DatagramSocket()
                    socket.broadcast = true
                    socket.soTimeout = 2000

                    val reqData = "NEXUSFLOW_DISCOVER".toByteArray()
                    val packet = DatagramPacket(
                        reqData,
                        reqData.size,
                        InetAddress.getByName("255.255.255.255"),
                        41234
                    )
                    socket.send(packet)

                    val buf = ByteArray(1024)
                    val recvPacket = DatagramPacket(buf, buf.size)
                    val startTime = System.currentTimeMillis()

                    while (System.currentTimeMillis() - startTime < 2000) {
                        try {
                            socket.receive(recvPacket)
                            val text = String(recvPacket.data, 0, recvPacket.length)
                            val json = JSONObject(text)
                            if (json.optString("app") == "nexusflow-pos") {
                                val port = json.optInt("port", 3000)
                                val serverIp = recvPacket.address.hostAddress ?: ""
                                val targetUrl = "http://$serverIp:$port"
                                val name = json.optString("name", "NexusFlow Retail POS")
                                onServerDiscovered(DiscoveredServer(name, targetUrl, 5))
                            }
                        } catch (e: Exception) {
                            break
                        }
                    }
                    socket.close()
                } catch (e: Exception) {
                    // UDP broadcast error fallback
                }
            }

            // 2. Localhost & Emulator probe
            val localProbes = listOf("http://10.0.2.2:3000", "http://127.0.0.1:3000", "http://localhost:3000")
            for (probe in localProbes) {
                executor.execute {
                    testPing(probe)?.let { onServerDiscovered(it) }
                }
            }

            // 3. Subnet HTTP ping sweep
            executor.execute {
                val subnetBase = getLocalSubnetPrefix()
                if (subnetBase != null) {
                    for (i in 1..254) {
                        val candidateUrl = "http://$subnetBase.$i:3000"
                        executor.execute {
                            testPing(candidateUrl)?.let { onServerDiscovered(it) }
                        }
                    }
                }

                // Stop progress spinner after 2.5s
                mainHandler.postDelayed({
                    progressLayout.visibility = View.GONE
                }, 2500)
            }
        }

        rescanBtn.setOnClickListener {
            startDiscovery()
        }

        // Run initial scan
        startDiscovery()
    }

    private fun testPing(baseUrl: String): DiscoveredServer? {
        return try {
            val start = System.currentTimeMillis()
            val url = URL("$baseUrl/api/ping")
            val conn = url.openConnection() as HttpURLConnection
            conn.connectTimeout = 400
            conn.readTimeout = 400
            conn.requestMethod = "GET"
            conn.connect()

            if (conn.responseCode in 200..299) {
                val reader = BufferedReader(InputStreamReader(conn.inputStream))
                val body = reader.readText()
                reader.close()
                val json = JSONObject(body)
                if (json.optString("app") == "nexusflow-pos" || json.optString("status") == "ok") {
                    val latency = System.currentTimeMillis() - start
                    val name = json.optString("name", "NexusFlow POS Server")
                    return DiscoveredServer(name, baseUrl, latency)
                }
            }
            null
        } catch (e: Exception) {
            null
        }
    }

    private fun getLocalSubnetPrefix(): String? {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (iface.isLoopback || !iface.isUp) continue
                val addresses = iface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    if (!addr.isLoopbackAddress && addr.hostAddress?.contains(".") == true) {
                        val ip = addr.hostAddress ?: continue
                        val parts = ip.split(".")
                        if (parts.size == 4) {
                            return "${parts[0]}.${parts[1]}.${parts[2]}"
                        }
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return null
    }

    // Handles native camera permission result from Android OS
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERMISSION_CODE) {
            runOnUiThread {
                if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    pendingPermissionRequest?.grant(
                        pendingPermissionRequest?.resources ?: arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                    )
                } else {
                    pendingPermissionRequest?.deny()
                    Toast.makeText(this, "Camera permission denied. Cannot scan barcodes.", Toast.LENGTH_LONG).show()
                }
                pendingPermissionRequest = null
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            val results: Array<Uri>? = if (resultCode == RESULT_OK) {
                // 1. Primary: Check if camera saved photo to designated file
                if (cameraPhotoFile != null && cameraPhotoFile!!.exists() && cameraPhotoFile!!.length() > 0 && cameraPhotoUri != null) {
                    arrayOf(cameraPhotoUri!!)
                } else if (data != null) {
                    val dataString = data.dataString
                    val clipData = data.clipData
                    if (clipData != null) {
                        Array(clipData.itemCount) { i -> clipData.getItemAt(i).uri }
                    } else if (dataString != null) {
                        arrayOf(Uri.parse(dataString))
                    } else if (data.extras?.get("data") is Bitmap) {
                        // 2. Thumbnail fallback if camera app didn't honor EXTRA_OUTPUT
                        try {
                            val bitmap = data.extras!!.get("data") as Bitmap
                            val tempFile = File.createTempFile("thumb_capture_", ".jpg", cacheDir)
                            FileOutputStream(tempFile).use { out ->
                                bitmap.compress(Bitmap.CompressFormat.JPEG, 92, out)
                            }
                            val fallbackUri = FileProvider.getUriForFile(
                                this,
                                "${applicationContext.packageName}.fileprovider",
                                tempFile
                            )
                            arrayOf(fallbackUri)
                        } catch (e: Exception) {
                            null
                        }
                    } else {
                        null
                    }
                } else if (cameraPhotoUri != null && cameraPhotoFile != null && cameraPhotoFile!!.exists() && cameraPhotoFile!!.length() > 0) {
                    arrayOf(cameraPhotoUri!!)
                } else {
                    null
                }
            } else {
                try {
                    cameraPhotoFile?.delete()
                } catch (e: Exception) {
                    // ignore
                }
                null
            }
            fileChooserCallback?.onReceiveValue(results)
            fileChooserCallback = null
            cameraPhotoFile = null
            cameraPhotoUri = null
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            promptForServerIp("Choose an action or switch POS server:")
        }
    }

    // JavaScript interface bridge to control FLAG_SECURE and switch servers dynamically
    inner class WebAppInterface(private val mContext: Context) {
        @JavascriptInterface
        fun setSecureFlags(enable: Boolean) {
            runOnUiThread {
                if (enable) {
                    window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
                    Toast.makeText(mContext, "🛡️ Screen capture protection enabled", Toast.LENGTH_SHORT).show()
                } else {
                    window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
                    Toast.makeText(mContext, "🔓 Developer Screen capture allowed", Toast.LENGTH_SHORT).show()
                }
            }
        }

        @JavascriptInterface
        fun switchServer() {
            runOnUiThread {
                promptForServerIp()
            }
        }

        @JavascriptInterface
        fun getServerIp(): String {
            val sharedPref = getPreferences(Context.MODE_PRIVATE)
            return sharedPref.getString("pos_server_ip", "") ?: ""
        }
    }
}
