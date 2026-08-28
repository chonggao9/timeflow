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
  private var client: AMapLocationClient? = null

  override fun definition() = ModuleDefinition {
    Name("AmapLocation")

    Function("setApiKey") { key: String ->
      AMapLocationClient.setApiKey(key)
    }

    // 一次性定位：首次拿到坐标即 resolve 并停止；30s 超时兜底
    AsyncFunction("getCurrentPosition") { promise: Promise ->
      getCurrentPosition(promise)
    }
  }

  private fun getCurrentPosition(promise: Promise) {
    val settled = AtomicBoolean(false)
    try {
      val option = AMapLocationClientOption().apply {
        isOnceLocation = true
        isOnceLocationLatest = false
        locationMode = AMapLocationClientOption.AMapLocationMode.Hight_Accuracy
        isNeedAddress = false
      }
      val locClient = AMapLocationClient(context)
      client = locClient
      locClient.setLocationOption(option)
      locClient.setLocationListener(object : AMapLocationListener {
        override fun onLocationChanged(loc: AMapLocation?) {
          if (settled.getAndSet(true)) return
          stop()
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
      locClient.startLocation()

      Handler(Looper.getMainLooper()).postDelayed({
        if (settled.getAndSet(true)) return@postDelayed
        stop()
        promise.reject("TIMEOUT", "AMap location timeout", null)
      }, 30000)
    } catch (e: Exception) {
      if (!settled.getAndSet(true)) {
        promise.reject("INIT_ERROR", e.message ?: "init error", e)
      }
    }
  }

  private fun stop() {
    try {
      client?.stopLocation()
    } catch (_: Exception) {}
    client = null
  }
}
