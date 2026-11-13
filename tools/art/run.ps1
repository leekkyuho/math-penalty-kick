$d = $PSScriptRoot
Add-Type -Path "$d\Proc.cs" -ReferencedAssemblies System.Drawing
[Proc]::Load("$d\orig.png")
$P = 36.0
$pL = [Proc]::Period(552, 712, 520, 1070, 20, 50)
$pR = [Proc]::Period(1770, 1900, 520, 1070, 20, 50)
"zone periods: left $pL right $pR"

# --- keeper hole ---
[Proc]::SegFill(668, 900, 1316, 1652, 1096, 1316, $P, 6)
[Proc]::SegFill(900, 940, 1316, 1640, 1096, 1316, $P, 6)
[Proc]::SegFill(900, 940, 1640, 1690, 1692, 1758, $P, 4)
[Proc]::SegFill(940, 1048, 1316, 1403, 1096, 1316, $P, 6)
[Proc]::SegFill(940, 1048, 1403, 1690, 1692, 1758, $P, 4)
[Proc]::SegFill(1048, 1090, 1316, 1704, 1096, 1316, $P, 6)
[Proc]::SegFill(1090, 1142, 1262, 1724, 1096, 1262, $P, 8)

# --- ball + shadow ---
[Proc]::TwoSide(1180, 1512, 1168, 1482, 340, 340)
# --- watermark sparkle ---
[Proc]::SegFill(1345, 1475, 2560, 2705, 2380, 2560, 1.0, 10)

# --- scoreboard text ---
[Proc]::HInterp(1030, 1252, 104, 197)
[Proc]::HInterp(1392, 1758, 104, 197)
[Proc]::HInterp(1022, 1728, 220, 411)

# --- number badges ---
[Proc]::Frost2(825, 648, 118, 9, 18)
[Proc]::Frost2(1425, 590, 96, 22, 26)
[Proc]::MaxSampleY = 1012
[Proc]::Frost2(825, 947, 118, 9, 18)
[Proc]::Frost2(2010, 640, 118, 9, 18)
[Proc]::Frost2(2013, 945, 118, 9, 18)

# --- premium pass ---
[Proc]::DepthOfField(3, 3)
[double[]]$cl = 250,150,520,120,11,  760,70,360,80,23,  2440,140,560,120,37,  1990,48,330,70,41,  -40,40,260,70,53,  2700,60,300,80,61
[Proc]::Clouds($cl)
[int[]]$ed = 1104,1138,1180,1232,1296,1372,1462
[Proc]::Stripes($ed, 1.055, 0.955)
[Proc]::SaveFullPng("$d\bg_full.png")
[Proc]::SaveBg("$d\bg.jpg", 2064, 86)
[Proc]::Sprite2("$d\keeper.png", 1296, 668, 1704, 1142, 60, 1046, 3)
[Proc]::Ball("$d\ball.png", 1375.5, 1340, 114, 1.0)
Get-ChildItem $d\bg.jpg, $d\keeper.png, $d\ball.png | Select-Object Name, Length
