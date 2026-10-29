package com.lifeos.app;

import android.webkit.CookieManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onStart() {
    super.onStart();
    // The site (Netlify) and the API (Render) have different addresses, so the login cookie counts as a
    // third-party cookie. Allow it explicitly so signing in works inside the app.
    WebView webView = getBridge().getWebView();
    CookieManager cookies = CookieManager.getInstance();
    cookies.setAcceptCookie(true);
    cookies.setAcceptThirdPartyCookies(webView, true);
  }
}
