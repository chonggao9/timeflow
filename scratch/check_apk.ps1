Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('d:\work\timeflow\timeflow-v1.0.28.apk')
$entries = $zip.Entries | Where-Object { $_.FullName -like '*.so' }
foreach ($e in $entries) {
    Write-Host "$($e.FullName) ($($e.Length) bytes)"
}
$zip.Dispose()
