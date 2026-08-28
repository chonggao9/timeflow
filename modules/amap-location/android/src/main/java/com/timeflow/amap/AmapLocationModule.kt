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

    Function("setApiKey") { key: String ->
      AMapLocationClient.setApiKey(key)
    }

    // 一次性定位：首次拿到坐标即 resolve 并停止/销毁；30s 超时兜底。
    // 每个调用用独立局部 client，避免并发调用互相干扰；结束调 onDestroy 释放资源。
    AsyncFunction("getCurrentPosition") { promise: Promise ->
      getCurrentPosition(promise)
    }
  }

  private fun getCurrentPosition(promise: Promise) {
    val settled = AtomicBoolean(false)
    var locClient: AMapLocationClient? = null
    val finish = {
      try { locClient?.stopLocation() } catch (_: Exception) {}
      try { locClient?.onDestroy() } catch (_: Exception) {}
      locClient = null
    }
    try {
      locClient = AMapLocationClient(context)
      val option = AMapLocationClientOption().apply {
        isOnceLocation = true
        isOnceLocationLatest = false
        locationMode = AMapLocationClientOption.AMapLocationMode.Hight_Accuracy
        isNeedAddress = false
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
                "provider" to "amap"
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
