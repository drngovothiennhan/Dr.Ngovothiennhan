package com.aithietchan.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File

class MainActivity : AppCompatActivity() {
    companion object {
        private const val APP_URL = "https://a-i-thiet-chan-v1-o2gk7z.v2.appdeploy.ai/"
        private const val APP_HOST = "a-i-thiet-chan-v1-o2gk7z.v2.appdeploy.ai"
        private const val USER_AGENT_SUFFIX = "AIThietChanAndroid/1.0.1"
    }

    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var cameraUri: Uri? = null
    private var pendingWebPermission: PermissionRequest? = null

    private val cameraPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val request = pendingWebPermission
            pendingWebPermission = null
            if (granted && request != null && isTrustedOrigin(request.origin)) {
                request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
            } else {
                request?.deny()
                if (!granted) {
                    Toast.makeText(
                        this,
                        "Không có quyền camera. Bạn vẫn có thể chọn ảnh từ thiết bị.",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }

    private val fileChooser =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = fileCallback ?: return@registerForActivityResult
            val uris = if (result.resultCode == Activity.RESULT_OK) {
                when {
                    result.data?.data != null -> arrayOf(result.data!!.data!!)
                    cameraUri != null -> arrayOf(cameraUri!!)
                    else -> emptyArray()
                }
            } else {
                emptyArray()
            }
            callback.onReceiveValue(uris)
            fileCallback = null
            cameraUri = null
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        secureAgainstOverlays()
        enterImmersiveMode()
        buildUi()
        configureWebView()
        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL)
        } else {
            webView.restoreState(savedInstanceState)
        }
        installBackHandling()
    }

    override fun onResume() {
        super.onResume()
        secureAgainstOverlays()
        enterImmersiveMode()
        if (::webView.isInitialized) webView.onResume()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersiveMode()
    }

    override fun onPause() {
        if (::webView.isInitialized) webView.onPause()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        if (::webView.isInitialized) webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        pendingWebPermission?.deny()
        pendingWebPermission = null
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        if (::webView.isInitialized) {
            webView.apply {
                stopLoading()
                webChromeClient = null
                webViewClient = WebViewClient()
                loadUrl("about:blank")
                clearHistory()
                (parent as? ViewGroup)?.removeView(this)
                destroy()
            }
        }
        super.onDestroy()
    }

    private fun secureAgainstOverlays() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            window.setHideOverlayWindows(true)
        }
    }

    private fun enterImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                    View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                )
        }
    }

    private fun buildUi() {
        root = FrameLayout(this).apply { setBackgroundColor(Color.WHITE) }
        webView = WebView(this)
        root.addView(
            webView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )
        setContentView(root)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        WebView.setWebContentsDebuggingEnabled(false)
        CookieManager.getInstance().setAcceptCookie(true)

        webView.setBackgroundColor(Color.WHITE)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            setSupportMultipleWindows(false)
            builtInZoomControls = false
            displayZoomControls = false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) safeBrowsingEnabled = true
            userAgentString = "$userAgentString $USER_AGENT_SUFFIX"
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val uri = request?.url ?: return false
                if (isTrustedAppUri(uri)) return false
                return openExternalUri(uri)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                enterImmersiveMode()
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    showNetworkError(error?.description?.toString())
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val asksForVideo =
                        request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                    if (!asksForVideo || !isTrustedOrigin(request.origin)) {
                        request.deny()
                        return@runOnUiThread
                    }

                    if (ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.CAMERA
                        ) == PackageManager.PERMISSION_GRANTED
                    ) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                    } else {
                        pendingWebPermission?.deny()
                        pendingWebPermission = request
                        cameraPermission.launch(Manifest.permission.CAMERA)
                    }
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.fileCallback?.onReceiveValue(null)
                this@MainActivity.fileCallback = filePathCallback
                return launchImageChooser()
            }
        }
    }

    private fun isTrustedOrigin(origin: Uri?): Boolean {
        return origin?.scheme == "https" && origin.host.equals(APP_HOST, ignoreCase = true)
    }

    private fun isTrustedAppUri(uri: Uri): Boolean {
        return uri.scheme == "https" && uri.host.equals(APP_HOST, ignoreCase = true)
    }

    private fun openExternalUri(uri: Uri): Boolean {
        return try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
            true
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, "Không có ứng dụng phù hợp để mở liên kết này.", Toast.LENGTH_SHORT)
                .show()
            true
        }
    }

    private fun launchImageChooser(): Boolean {
        val pickIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "image/*"
        }

        val initialIntents = mutableListOf<Intent>()
        try {
            val cameraDir = File(cacheDir, "camera").apply { mkdirs() }
            val imageFile = File(cameraDir, "tongue-${System.currentTimeMillis()}.jpg")
            cameraUri = FileProvider.getUriForFile(this, "$packageName.fileprovider", imageFile)
            initialIntents += Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                putExtra(MediaStore.EXTRA_OUTPUT, cameraUri)
                addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        } catch (_: Exception) {
            cameraUri = null
        }

        return try {
            val chooser = Intent.createChooser(pickIntent, "Chọn ảnh lưỡi").apply {
                if (initialIntents.isNotEmpty()) {
                    putExtra(Intent.EXTRA_INITIAL_INTENTS, initialIntents.toTypedArray())
                }
            }
            fileChooser.launch(chooser)
            true
        } catch (_: ActivityNotFoundException) {
            fileCallback?.onReceiveValue(null)
            fileCallback = null
            cameraUri = null
            Toast.makeText(this, "Không tìm thấy Camera hoặc trình chọn ảnh.", Toast.LENGTH_LONG).show()
            false
        }
    }

    private fun showNetworkError(detail: String?) {
        root.removeAllViews()
        val errorView = TextView(this).apply {
            text = buildString {
                append("Không thể kết nối A.I Thiệt Chẩn.\nChạm để thử lại.")
                if (!detail.isNullOrBlank()) append("\n\n$detail")
            }
            textSize = 18f
            setTextColor(Color.DKGRAY)
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
            setOnClickListener {
                root.removeAllViews()
                root.addView(
                    webView,
                    FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                    )
                )
                webView.loadUrl(APP_URL)
            }
        }
        root.addView(
            errorView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )
    }

    private fun installBackHandling() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    ::webView.isInitialized && webView.canGoBack() -> webView.goBack()
                    else -> finish()
                }
            }
        })
    }
}
