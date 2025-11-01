package expo.modules.floatingscanner

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle

class MediaProjectionActivity : Activity() {
    
    companion object {
        const val REQUEST_CODE = 1001
        
        fun createIntent(context: Context): Intent {
            return Intent(context, MediaProjectionActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        val mediaProjectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(mediaProjectionManager.createScreenCaptureIntent(), REQUEST_CODE)
    }
    
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        
        if (requestCode == REQUEST_CODE && resultCode == RESULT_OK && data != null) {
            ScreenCaptureManager.handlePermissionResult(resultCode, data)
        }
        finish()
    }
}
