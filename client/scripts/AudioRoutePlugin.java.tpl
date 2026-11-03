// audio-route v2 (voice starts on the earpiece, video on the loudspeaker)
package __PACKAGE__;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.List;

/**
 * Where the call sound goes: loudspeaker, phone earpiece, Bluetooth or a wired headset.
 * start() at the beginning of a call, setRoute() from the Speaker button, stop() when the call ends.
 * Sends a "routeChanged" event when Bluetooth or a headset is connected or removed during the call.
 */
@CapacitorPlugin(
    name = "AudioRoute",
    permissions = { @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = "bluetooth") }
)
public class AudioRoutePlugin extends Plugin {
  private AudioManager audio;
  private boolean active = false;
  /** Where the call sound returns to when Bluetooth or a headset goes away: earpiece for voice calls, loudspeaker for video calls. */
  private String home = "earpiece";
  private AudioDeviceCallback callback;
  private final Handler main = new Handler(Looper.getMainLooper());

  @Override
  public void load() {
    audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
  }

  /** speaker | earpiece | bluetooth | headset | "" for a type we do not use */
  private static String kindOf(int type) {
    switch (type) {
      case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER: return "speaker";
      case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE: return "earpiece";
      case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
      case AudioDeviceInfo.TYPE_BLE_HEADSET: return "bluetooth";
      case AudioDeviceInfo.TYPE_WIRED_HEADSET:
      case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
      case AudioDeviceInfo.TYPE_USB_HEADSET: return "headset";
      default: return "";
    }
  }

  private List<AudioDeviceInfo> outputs() {
    List<AudioDeviceInfo> list = new ArrayList<>();
    if (audio == null) return list;
    if (Build.VERSION.SDK_INT >= 31) {
      list.addAll(audio.getAvailableCommunicationDevices());
    } else {
      for (AudioDeviceInfo d : audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) list.add(d);
    }
    return list;
  }

  private AudioDeviceInfo find(String kind) {
    for (AudioDeviceInfo d : outputs()) if (kindOf(d.getType()).equals(kind)) return d;
    return null;
  }

  private boolean has(String kind) {
    return find(kind) != null;
  }

  @SuppressWarnings("deprecation")
  private String currentRoute() {
    if (audio == null) return "speaker";
    if (Build.VERSION.SDK_INT >= 31) {
      AudioDeviceInfo d = audio.getCommunicationDevice();
      if (d != null) {
        String k = kindOf(d.getType());
        if (!k.isEmpty()) return k;
      }
      return "earpiece";
    }
    if (audio.isSpeakerphoneOn()) return "speaker";
    if (audio.isBluetoothScoOn()) return "bluetooth";
    return has("headset") ? "headset" : "earpiece";
  }

  private JSObject state() {
    JSObject o = new JSObject();
    JSArray available = new JSArray();
    // The phone speaker and earpiece are always offered, even if the system does not list them.
    available.put("speaker");
    if (has("earpiece") || !has("headset")) available.put("earpiece");
    if (has("headset")) available.put("headset");
    AudioDeviceInfo bt = find("bluetooth");
    if (bt != null) available.put("bluetooth");
    o.put("route", currentRoute());
    o.put("available", available);
    o.put("bluetoothName", bt != null && bt.getProductName() != null ? bt.getProductName().toString() : "");
    o.put("active", active);
    return o;
  }

  @SuppressWarnings("deprecation")
  private void apply(String route) {
    if (audio == null) return;
    if (Build.VERSION.SDK_INT >= 31) {
      AudioDeviceInfo d = find(route);
      if (d == null) d = find("speaker");
      if (d != null) audio.setCommunicationDevice(d);
      return;
    }
    switch (route) {
      case "bluetooth":
        audio.setSpeakerphoneOn(false);
        audio.startBluetoothSco();
        audio.setBluetoothScoOn(true);
        break;
      case "speaker":
        audio.stopBluetoothSco();
        audio.setBluetoothScoOn(false);
        audio.setSpeakerphoneOn(true);
        break;
      default: // earpiece or wired headset: the phone chooses the wired headset by itself
        audio.stopBluetoothSco();
        audio.setBluetoothScoOn(false);
        audio.setSpeakerphoneOn(false);
        break;
    }
  }

  private void tellApp() {
    notifyListeners("routeChanged", state());
  }

  private void tellAppSoon() {
    main.postDelayed(this::tellApp, 700); // Bluetooth takes a moment to connect
  }

  private boolean needsBluetoothPermission() {
    return Build.VERSION.SDK_INT >= 31
        && getContext().checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED;
  }

  private void begin(PluginCall call) {
    active = true;
    home = Boolean.TRUE.equals(call.getBoolean("video", false)) ? "speaker" : "earpiece"; // like WhatsApp
    audio.setMode(AudioManager.MODE_IN_COMMUNICATION);
    if (callback == null) {
      callback = new AudioDeviceCallback() {
        @Override
        public void onAudioDevicesAdded(AudioDeviceInfo[] added) {
          if (!active) return;
          for (AudioDeviceInfo d : added) {
            String k = kindOf(d.getType());
            // Like WhatsApp: a Bluetooth or wired headset that connects during a call takes over the sound.
            if (k.equals("bluetooth") || k.equals("headset")) { apply(k); break; }
          }
          tellAppSoon();
        }

        @Override
        public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) {
          if (!active) return;
          String now = currentRoute();
          if (!has(now)) apply(home); // the headset or Bluetooth is gone: back to where the call started
          tellAppSoon();
        }
      };
      audio.registerAudioDeviceCallback(callback, main);
    }
    String first = has("bluetooth") ? "bluetooth" : has("headset") ? "headset" : home;
    apply(first);
    tellAppSoon();
    call.resolve(state());
  }

  @PluginMethod
  public void start(PluginCall call) {
    if (audio == null) { call.resolve(new JSObject()); return; }
    if (needsBluetoothPermission()) {
      requestPermissionForAlias("bluetooth", call, "afterBluetoothPermission");
      return;
    }
    begin(call);
  }

  @PermissionCallback
  private void afterBluetoothPermission(PluginCall call) {
    begin(call); // allowed or not, the call still gets sound; without permission Bluetooth is simply not offered
  }

  @PluginMethod
  public void setRoute(PluginCall call) {
    String route = call.getString("route", "speaker");
    apply(route);
    tellAppSoon();
    call.resolve(state());
  }

  @PluginMethod
  public void getState(PluginCall call) {
    call.resolve(state());
  }

  @SuppressWarnings("deprecation")
  @PluginMethod
  public void stop(PluginCall call) {
    active = false;
    if (audio != null) {
      if (callback != null) { audio.unregisterAudioDeviceCallback(callback); callback = null; }
      if (Build.VERSION.SDK_INT >= 31) audio.clearCommunicationDevice();
      else { audio.stopBluetoothSco(); audio.setBluetoothScoOn(false); audio.setSpeakerphoneOn(false); }
      audio.setMode(AudioManager.MODE_NORMAL);
    }
    call.resolve();
  }

  @Override
  protected void handleOnDestroy() {
    if (active && audio != null) {
      active = false;
      if (callback != null) { audio.unregisterAudioDeviceCallback(callback); callback = null; }
    }
  }
}
