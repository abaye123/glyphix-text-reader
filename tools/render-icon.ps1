# Draws the app icon. Usage: .\tools\render-icon.ps1 -Out <full path of icon.png>
param([string]$Out, [int]$Size = 100)
Add-Type -AssemblyName System.Drawing
$b = New-Object System.Drawing.Bitmap 400, 400
$g = [System.Drawing.Graphics]::FromImage($b)
$g.SmoothingMode = 'AntiAlias'
$r = New-Object System.Drawing.Rectangle 0, 0, 400, 400
$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush $r, ([System.Drawing.Color]::FromArgb(40, 160, 230)), ([System.Drawing.Color]::FromArgb(20, 60, 140)), 60
$g.FillEllipse($grad, 4, 4, 392, 392)
$g.FillRectangle([System.Drawing.Brushes]::White, 120, 90, 160, 220)
$p = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(30, 90, 170)), 14
foreach ($y in 130, 170, 210) { $g.DrawLine($p, 145, $y, 255, $y) }
$g.DrawLine($p, 195, 250, 255, 250)
$s = New-Object System.Drawing.Bitmap $b, $Size, $Size
$s.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
