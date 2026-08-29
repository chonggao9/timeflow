package com.timeflow.amap

import android.os.Handler
import android.os.Looper
import com.amap.api.location.AMapLocation
import com.amap.api.location.AMapLocationClient
import com.amap.api.location.AMapLocationClientOption
import com.amap.api.location.AMapLocationListener
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

class AmapLocationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AmapLocation")

    // 一次性定位：隐私合规 → setApiKey → 构造 client → 定位；30s 超时兜底。
    // 每个调用用独立局部 client，避免并发调用互相干扰；结束调 onDestroy 释放资源。
    AsyncFunction("getCurrentPosition") { key: String, promise: Promise ->
      getCurrentPosition(key, promise)
    }
  }

  private fun getCurrentPosition(key: String, promise: Promise) {
    val settled = AtomicBoolean(false)
    val ctx = appContext.reactContext
    if (ctx == null) {
      promise.reject("NO_CONTEXT", "App context unavailable", null)
      return
    }
    var locClient: AMapLocationClient? = null
    val finish = {
      try { locClient?.stopLocation() } catch (_: Exception) {}
      try { locClient?.onDestroy() } catch (_: Exception) {}
      locClient = null
    }
    try {
      // 高德要求：调用任何 SDK 接口（含 setApiKey）之前，先调用隐私合规 2 个接口，参数须为 true
      AMapLocationClient.updatePrivacyShow(ctx, true, true)
      AMapLocationClient.updatePrivacyAgree(ctx, true)
      // 设置 apiKey（必须在隐私合规之后、构造 client 之前）
      AMapLocationClient.setApiKey(key)
      locClient = AMapLocationClient(ctx)
      val option = AMapLocationClientOption().apply {
        isOnceLocation = true
        isOnceLocationLatest = false
        locationMode = AMapLocationClientOption.AMapLocationMode.Hight_Accuracy
        isNeedAddress = true
      }
      locClient?.setLocationOption(option)
      locClient?.setLocationListener(object : AMapLocationListener {
        override fun onLocationChanged(loc: AMapLocation?) {
          if (settled.getAndSet(true)) return
          finish()
          if (loc != null && loc.errorCode == 0) {
            promise.resolve(
              mapOf(
                "latitude" to loc.latitude,
                "longitude" to loc.longitude,
                "accuracy" to loc.accuracy.toDouble(),
                "timestamp" to loc.time,
                "provider" to "amap",
                "address" to (loc.address ?: ""),
                "poiName" to (loc.poiName ?: ""),
                "aoiName" to (loc.aoiName ?: ""),
                "city" to (loc.city ?: ""),
                "district" to (loc.district ?: ""),
                "street" to (loc.street ?: "")
              )
            )
          } else {
            promise.reject(
              "LOCATION_ERROR",
              "AMap error ${loc?.errorCode}: ${loc?.errorInfo}",
              null
            )
          }
        }
      })
      locClient?.startLocation()

      Handler(Looper.getMainLooper()).postDelayed({
        if (settled.getAndSet(true)) return@postDelayed
        finish()
        promise.reject("TIMEOUT", "AMap location timeout", null)
      }, 30000)
    } catch (e: Exception) {
      if (!settled.getAndSet(true)) {
        finish()
        promise.reject("INIT_ERROR", e.message ?: "init error", e)
      }
    }
  }
}
