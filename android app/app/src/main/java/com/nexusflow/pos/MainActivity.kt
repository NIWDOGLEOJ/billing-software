package com.nexusflow.pos

import android.Manifest
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.provider.MediaStore
import android.view.View
import android.webkit.*
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val CAMERA_PERMISSION_CODE = 1001
    private val FILE_CHOOSER_REQUEST_CODE = 1002
    private var pendingPermissionRequest: PermissionRequest? = null
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var cameraPhotoUri: Uri? = null
    private var cameraPhotoFile: File? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Enforce screenshot and screen-recording blocking by default
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)

        // Make the POS layout full screen and immersive
        enableImmersiveMode()

        webView = findViewById(R.id.webView)
        setupWebView()

        // Get saved POS Server IP address or prompt on first launch
        val sharedPref = getPreferences(Context.MODE_PRIVATE)
        val savedIp = sharedPref.getString("pos_server_ip", null)

        if (savedIp != null) {
            val url = if (savedIp.startsWith("http://") || savedIp.startsWith("https://")) {
                savedIp
            } else if (savedIp.contains(":")) {
                "https://$savedIp"
            } else {
                "https://$savedIp:5173"
            }
            webView.loadUrl(url)
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

        // Mount JavaScript bridge for screen capture security flags
        webView.addJavascriptInterface(WebAppInterface(this), "Android")

        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                Toast.makeText(this@MainActivity, "Connection error. Please check server IP and LAN status.", Toast.LENGTH_LONG).show()
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

                // Direct native camera launch if capture attribute is requested
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

    private fun promptForServerIp() {
        val builder = AlertDialog.Builder(this)
        builder.setTitle("Configure POS Server")
        builder.setMessage("Please enter the local IP address or URL of your POS Server (e.g. 192.168.1.10 or 10.0.2.2 for local emulator loopback):")

        val input = EditText(this)
        input.hint = "192.168.1.x or https://192.168.1.x:5173"
        
        val lp = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.MATCH_PARENT
        )
        input.layoutParams = lp
        builder.setView(input)

        builder.setPositiveButton("Connect") { dialog, _ ->
            val rawIp = input.text.toString().trim()
            if (rawIp.isNotEmpty()) {
                val targetUrl = if (rawIp.startsWith("http://") || rawIp.startsWith("https://")) {
                    rawIp
                } else if (rawIp.contains(":")) {
                    "https://$rawIp"
                } else {
                    "https://$rawIp:5173"
                }
                val sharedPref = getPreferences(Context.MODE_PRIVATE)
                with(sharedPref.edit()) {
                    putString("pos_server_ip", rawIp)
                    apply()
                }
                webView.loadUrl(targetUrl)
                Toast.makeText(this, "Connecting to $targetUrl...", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "IP Address cannot be empty", Toast.LENGTH_SHORT).show()
                promptForServerIp()
            }
            dialog.dismiss()
        }

        builder.setCancelable(false)
        builder.show()
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
                // If user cancelled, clean up unused temp file
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
            super.onBackPressed()
        }
    }

    // JavaScript interface bridge to control FLAG_SECURE dynamically
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
    }
}
