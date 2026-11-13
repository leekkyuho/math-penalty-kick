# template.html + assets/* -> ../index.html (single offline file, images inlined as base64)
# usage: powershell -ExecutionPolicy Bypass -File src\build.ps1
param([string]$out = (Join-Path (Split-Path $PSScriptRoot -Parent) "index.html"))
$d = $PSScriptRoot
$a = Join-Path $d "assets"
function Uri([string]$f, [string]$type) { "data:$type;base64," + [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $a $f))) }

$html = [IO.File]::ReadAllText((Join-Path $d "template.html"), [Text.Encoding]::UTF8)
$html = $html.Replace("%%BG%%", (Uri "bg.jpg" "image/jpeg"))
$map = @{ KEEPER = "keeper.png"; BALL = "ball.png"; KBODY = "k_body.png"; KARML = "k_armL.png"; KARMR = "k_armR.png"; MASKL = "m_L.png"; MASKR = "m_R.png"; MASKC = "m_C.png" }
foreach ($k in $map.Keys) { $html = $html.Replace("%%$k%%", (Uri $map[$k] "image/png")) }
if ($html.Contains("%%")) { throw "unreplaced placeholder" }

$head = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>'   # <title> comes from template.html
[IO.File]::WriteAllText($out, $head + $html + "</body></html>", (New-Object Text.UTF8Encoding $false))
"{0}  {1:N0} bytes" -f $out, (Get-Item $out).Length
