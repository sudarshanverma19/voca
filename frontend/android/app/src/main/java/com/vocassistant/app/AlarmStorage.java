package com.vocassistant.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Persists scheduled alarm data to SharedPreferences so AlarmReceiver
 * can reschedule them after a device reboot.
 */
public class AlarmStorage {

    private static final String PREFS = "vocaflow_alarms";
    private static final String KEY   = "alarms_json";

    public static class AlarmEntry {
        public final String scheduleId;
        public final String taskName;
        public final long   triggerAtMs;

        AlarmEntry(String scheduleId, String taskName, long triggerAtMs) {
            this.scheduleId  = scheduleId;
            this.taskName    = taskName;
            this.triggerAtMs = triggerAtMs;
        }
    }

    public static void save(Context ctx, String scheduleId, String taskName, long triggerAtMs) {
        try {
            List<AlarmEntry> list = loadAll(ctx);
            // Replace if exists
            list.removeIf(e -> e.scheduleId.equals(scheduleId));
            list.add(new AlarmEntry(scheduleId, taskName, triggerAtMs));
            persist(ctx, list);
        } catch (Exception ignored) {}
    }

    public static void remove(Context ctx, String scheduleId) {
        try {
            List<AlarmEntry> list = loadAll(ctx);
            list.removeIf(e -> e.scheduleId.equals(scheduleId));
            persist(ctx, list);
        } catch (Exception ignored) {}
    }

    public static List<AlarmEntry> loadAll(Context ctx) {
        List<AlarmEntry> list = new ArrayList<>();
        try {
            String json = prefs(ctx).getString(KEY, "[]");
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                list.add(new AlarmEntry(
                        o.getString("scheduleId"),
                        o.getString("taskName"),
                        o.getLong("triggerAtMs")));
            }
        } catch (Exception ignored) {}
        return list;
    }

    private static void persist(Context ctx, List<AlarmEntry> list) throws Exception {
        JSONArray arr = new JSONArray();
        for (AlarmEntry e : list) {
            JSONObject o = new JSONObject();
            o.put("scheduleId",  e.scheduleId);
            o.put("taskName",    e.taskName);
            o.put("triggerAtMs", e.triggerAtMs);
            arr.put(o);
        }
        prefs(ctx).edit().putString(KEY, arr.toString()).apply();
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
