package com.vocassistant.app;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom plugins BEFORE super.onCreate()
        registerPlugin(AlarmPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Called when the app is launched or brought to the front via an Intent
     * (like our AlarmService full-screen intent).
     */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        checkIntentForAlarm(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        checkIntentForAlarm(getIntent());
    }

    private void checkIntentForAlarm(Intent intent) {
        if (intent != null && intent.getBooleanExtra("fromAlarm", false)) {
            String scheduleId = intent.getStringExtra("scheduleId");
            Log.d("MainActivity", "Launched from alarm! scheduleId=" + scheduleId);

            // Send a custom event to the JavaScript side
            JSObject data = new JSObject();
            data.put("scheduleId", scheduleId);
            bridge.triggerWindowJSEvent("vocaflow:incoming_call", data.toString());
            
            // Clear the flag so it doesn't trigger again on every resume
            intent.putExtra("fromAlarm", false);
        }
    }
}
