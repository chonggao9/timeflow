Add-Type -AssemblyName System.Drawing

function Resize-Image {
    param (
        [string]$SourcePath,
        [string]$DestinationPath,
        [int]$TargetWidth,
        [int]$TargetHeight,
        [string]$Format = "PNG"
    )

    $srcImg = [System.Drawing.Image]::FromFile($SourcePath)
    $destBmp = New-Object System.Drawing.Bitmap($TargetWidth, $TargetHeight)
    $graphics = [System.Drawing.Graphics]::FromImage($destBmp)
    
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $graphics.DrawImage($srcImg, 0, 0, $TargetWidth, $TargetHeight)
    
    $srcImg.Dispose()
    $graphics.Dispose()

    # If destination exists and is same as source, remove it after srcImg disposed
    if (Test-Path $DestinationPath) {
        Remove-Item $DestinationPath -Force
    }

    if ($Format -eq "PNG") {
        $destBmp.Save($DestinationPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } elseif ($Format -eq "JPEG") {
        $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
        $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]95)
        $destBmp.Save($DestinationPath, $codec, $encoderParams)
    }
    
    $destBmp.Dispose()
    Write-Output "Resized $SourcePath -> $DestinationPath ($TargetWidth x $TargetHeight, $Format)"
}

$root = "D:\work\timeflow\store_assets"

# 1. App icon must be strictly 512 x 512
$tempIcon = "$root\temp_icon_src.png"
Copy-Item "$root\app_icon_512x512.png" $tempIcon
Resize-Image -SourcePath $tempIcon -DestinationPath "$root\app_icon_512x512.png" -TargetWidth 512 -TargetHeight 512 -Format "PNG"
Resize-Image -SourcePath $tempIcon -DestinationPath "$root\app_icon_512x512.jpg" -TargetWidth 512 -TargetHeight 512 -Format "JPEG"
Remove-Item $tempIcon -Force

# 2. Feature graphic must be strictly 1024 x 500
$tempFg = "$root\temp_fg_src.jpg"
Copy-Item "$root\feature_graphic_1024x500.jpg" $tempFg
Resize-Image -SourcePath $tempFg -DestinationPath "$root\feature_graphic_1024x500.jpg" -TargetWidth 1024 -TargetHeight 500 -Format "JPEG"
Resize-Image -SourcePath $tempFg -DestinationPath "$root\feature_graphic_1024x500.png" -TargetWidth 1024 -TargetHeight 500 -Format "PNG"
Remove-Item $tempFg -Force

# 3. Screenshot 1 check-in to 1080 x 1920
$tempShot1 = "$root\temp_shot1_src.jpg"
Copy-Item "$root\screenshot_1_checkin.jpg" $tempShot1
Resize-Image -SourcePath $tempShot1 -DestinationPath "$root\screenshot_1_checkin.jpg" -TargetWidth 1080 -TargetHeight 1920 -Format "JPEG"
Resize-Image -SourcePath $tempShot1 -DestinationPath "$root\screenshot_1_checkin.png" -TargetWidth 1080 -TargetHeight 1920 -Format "PNG"
Remove-Item $tempShot1 -Force

Write-Output "All Google Play store assets resized to exact pixel specifications!"
