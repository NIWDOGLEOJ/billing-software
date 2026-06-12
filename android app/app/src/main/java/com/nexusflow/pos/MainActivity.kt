package com.nexusflow.pos

import android.Manifest
import android.app.AlertDialog
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.webkit.*
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val CAMERA_PERMISSION_CODE = 1001
    private var pendingPermissionRequest: PermissionRequest? = null

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
            webView.loadUrl("http://$savedIp:5173")
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

        // Force hardware acceleration for modern glassmorphism graphics performance
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)

        // Mount JavaScript bridge for screen capture security flags
        webView.addJavascriptInterface(WebAppInterface(this), "Android")

        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                Toast.makeText(this@MainActivity, "Connection error. Please check server IP and LAN status.", Toast.LENGTH_LONG).show()
            }
        }

        // WebChromeClient handles console logs, alerts, and camera permission requests in WebView
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                for (resource in request.resources) {
                    if (resource == PermissionRequest.RESOURCE_VIDEO_CAPTURE) {
                        pendingPermissionRequest = request
                        // Check if Android app has camera permission from OS
                        if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA)
                            == PackageManager.PERMISSION_GRANTED) {
                            request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                        } else {
                            // Request native camera permission
                            ActivityCompat.requestPermissions(
                                this@MainActivity,
                                arrayOf(Manifest.permission.CAMERA),
                                CAMERA_PERMISSION_CODE
                            )
                        }
                        return
                    }
                }
                super.onPermissionRequest(request)
            }
        }
    }

    private fun promptForServerIp() {
        val builder = AlertDialog.Builder(this)
        builder.setTitle("Configure POS Server")
        builder.setMessage("Please enter the local IP address of your POS Server (e.g. 192.168.1.10 or 10.0.2.2 for local emulator loopback):")

        val input = EditText(this)
        input.hint = "192.168.1.x"
        
        val lp = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.MATCH_PARENT
        )
        input.layoutParams = lp
        builder.setView(input)

        builder.setPositiveButton("Connect") { dialog, _ ->
            val ip = input.text.toString().trim()
            if (ip.isNotEmpty()) {
                val sharedPref = getPreferences(Context.MODE_PRIVATE)
                with(sharedPref.edit()) {
                    putString("pos_server_ip", ip)
                    apply()
                }
                webView.loadUrl("http://$ip:5173")
                Toast.makeText(this, "Connecting to $ip...", Toast.LENGTH_SHORT).show()
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
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                pendingPermissionRequest?.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
            } else {
                pendingPermissionRequest?.deny()
                Toast.makeText(this, "Camera permission denied. Cannot scan barcodes.", Toast.LENGTH_LONG).show()
            }
            pendingPermissionRequest = null
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
