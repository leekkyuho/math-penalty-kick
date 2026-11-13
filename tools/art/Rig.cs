using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;

public static class Rig {
  static int W, H; static int[] px;
  public static void Load(string p) {
    using (var b = new Bitmap(p)) {
      W = b.Width; H = b.Height; px = new int[W * H];
      var d = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
      Marshal.Copy(d.Scan0, px, 0, px.Length); b.UnlockBits(d);
    }
  }
  static bool Inside(double[] poly, double x, double y) {
    bool c = false; int n = poly.Length / 2;
    for (int i = 0, j = n - 1; i < n; j = i++) {
      double xi = poly[2 * i], yi = poly[2 * i + 1], xj = poly[2 * j], yj = poly[2 * j + 1];
      if (((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  }
  // Writes body (sprite minus both arm polygons) and each arm, cropped to its bbox. Returns offsets.
  public static string Split(string outBody, string outL, string outR, double[] polyL, double[] polyR) {
    int[] body = (int[])px.Clone(); int[] L = new int[W * H], R = new int[W * H];
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
      int i = y * W + x; double cx = x + 0.5, cy = y + 0.5;
      if (Inside(polyL, cx, cy)) { L[i] = px[i]; body[i] = 0; }
      else if (Inside(polyR, cx, cy)) { R[i] = px[i]; body[i] = 0; }
    }
    var sb = new StringBuilder();
    sb.AppendLine("body " + Save(body, outBody));
    sb.AppendLine("armL " + Save(L, outL));
    sb.AppendLine("armR " + Save(R, outR));
    return sb.ToString();
  }
  static string Save(int[] a, string path) {
    int minx = W, miny = H, maxx = -1, maxy = -1;
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) if (((a[y * W + x] >> 24) & 255) > 0) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    int w = maxx - minx + 1, h = maxy - miny + 1; int[] o = new int[w * h];
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) o[y * w + x] = a[(y + miny) * W + x + minx];
    using (var b = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
      var d = b.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
      Marshal.Copy(o, 0, d.Scan0, o.Length); b.UnlockBits(d); b.Save(path, ImageFormat.Png);
    }
    return string.Format("x={0} y={1} w={2} h={3}", minx, miny, w, h);
  }
  public static string Sample(int x, int y, int r) {
    long sr = 0, sg = 0, sb = 0; int n = 0;
    for (int dy = -r; dy <= r; dy++) for (int dx = -r; dx <= r; dx++) { int c = px[(y + dy) * W + x + dx]; if (((c >> 24) & 255) < 250) continue; sr += (c >> 16) & 255; sg += (c >> 8) & 255; sb += c & 255; n++; }
    if (n == 0) return "transparent";
    return string.Format("#{0:x2}{1:x2}{2:x2}", sr / n, sg / n, sb / n);
  }
}
