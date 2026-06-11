# Add project specific ProGuard rules here.

# ── Preserve line numbers for crash stack traces ───────────────────────────
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ── AlarmStorage: uses JSON reflection (org.json) ─────────────────────────
# AlarmStorage.java serialises AlarmEntry objects via JSONObject — without
# this rule R8 strips the field names and JSON parse breaks at runtime.
-keepclassmembers class com.vocassistant.app.AlarmStorage$AlarmEntry {
    public final java.lang.String scheduleId;
    public final java.lang.String taskName;
    public final long triggerAtMs;
}

# ── Keep all custom plugin / receiver / service classes ────────────────────
-keep class com.vocassistant.app.** { *; }

# ── Capacitor bridge — must not be obfuscated ─────────────────────────────
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }

# ── WebView JS interface (Capacitor uses reflection to call Java methods) ──
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod *;
}

# ── Supabase / OkHttp / JSON used by @capacitor/browser and @capacitor/app ─
-dontwarn okhttp3.**
-dontwarn okio.**
