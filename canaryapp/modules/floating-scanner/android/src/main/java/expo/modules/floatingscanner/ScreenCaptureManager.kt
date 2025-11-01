package expo.modules.floatingscanner

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.DisplayMetrics
import android.view.WindowManager
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

object ScreenCaptureManager {
    private var mediaProjection: MediaProjection? = null
    private var resultCode: Int? = null
    private var resultData: Intent? = null
    private var onScreenshotCaptured: ((String, Long) -> Unit)? = null
    
    fun handlePermissionResult(code: Int, data: Intent) {
        resultCode = code
        resultData = data
    }
    
    fun setScreenshotCallback(callback: (String, Long) -> Unit) {
        onScreenshotCaptured = callback
    }
    
    fun hasPermission(): Boolean {
        return resultCode == Activity.RESULT_OK && resultData != null
    }
    
    fun captureScreen(context: Context) {
        if (!hasPermission()) {
            // Request permission first
            context.startActivity(MediaProjectionActivity.createIntent(context))
            return
        }
        
        val mediaProjectionManager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        
        try {
            mediaProjection = mediaProjectionManager.getMediaProjection(resultCode!!, resultData!!)
            
            val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val display = windowManager.defaultDisplay
            val metrics = DisplayMetrics()
            display.getRealMetrics(metrics)
            
            val width = metrics.widthPixels
            val height = metrics.heightPixels
            val density = metrics.densityDpi
            
            val imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
            
            val virtualDisplay = mediaProjection?.createVirtualDisplay(
                "ScreenCapture",
                width,
                height,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.surface,
                null,
                null
            )
            
            // Wait a bit for the screen to be captured
            Handler(Looper.getMainLooper()).postDelayed({
                try {
                    val image = imageReader.acquireLatestImage()
                    if (image != null) {
                        val bitmap = imageToBitmap(image, width, height)
                        val base64 = bitmapToBase64(bitmap)
                        
                        // Send to React Native
                        onScreenshotCaptured?.invoke(base64, System.currentTimeMillis())
                        
                        image.close()
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                } finally {
                    virtualDisplay?.release()
                    imageReader.close()
                    mediaProjection?.stop()
                    mediaProjection = null
                }
            }, 100)
            
        } catch (e: Exception) {
            e.printStackTrace()
            mediaProjection?.stop()
            mediaProjection = null
        }
    }
    
    private fun imageToBitmap(image: Image, width: Int, height: Int): Bitmap {
        val planes = image.planes
        val buffer: ByteBuffer = planes[0].buffer
        val pixelStride = planes[0].pixelStride
        val rowStride = planes[0].rowStride
        val rowPadding = rowStride - pixelStride * width
        
        val bitmap = Bitmap.createBitmap(
            width + rowPadding / pixelStride,
            height,
            Bitmap.Config.ARGB_8888
        )
        bitmap.copyPixelsFromBuffer(buffer)
        
        return if (rowPadding == 0) {
            bitmap
        } else {
            Bitmap.createBitmap(bitmap, 0, 0, width, height)
        }
    }
    
    private fun bitmapToBase64(bitmap: Bitmap): String {
        val outputStream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 80, outputStream)
        val byteArray = outputStream.toByteArray()
        return Base64.encodeToString(byteArray, Base64.NO_WRAP)
    }
    
    fun cleanup() {
        mediaProjection?.stop()
        mediaProjection = null
        resultCode = null
        resultData = null
    }
}
