using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;

public static class Crowd {
  static int W, H; static int[] px;
  public static void Load(string p) {
    using (var b = new Bitmap(p)) {
      W = b.Width; H = b.Height; px = new int[W * H];
      var d = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
      Marshal.Copy(d.Scan0, px, 0, px.Length); b.UnlockBits(d);
    }
  }
  public static string Sample(int x, int y) {
    int c = px[y * W + x];
    return string.Format("{0},{1} = ({2},{3},{4})", x, y, (c >> 16) & 255, (c >> 8) & 255, c & 255);
  }
  static double Cl(double v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  public static double SeatR0 = 50, SeatR1 = 40, RMax = 150, RRange = 40, BG0 = 12, BG1 = 30;
  // 1 = blue seat (fans may show), 0 = structure / net / fence / sky
  public static double Seat(int c) {
    double r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    return Cl((b - r - SeatR0) / SeatR1) * Cl((RMax - r) / RRange) * Cl((b - g - BG0) / BG1);
  }
  // Writes an RGBA PNG (white, alpha = seatness) of the box, downsampled by 'div'
  public static string Mask(string path, int x0, int y0, int x1, int y1, int div, double[] holes) {
    int w = (x1 - x0) / div, h = (y1 - y0) / div; int[] o = new int[w * h]; long sum = 0;
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
      double a = 0;
      for (int dy = 0; dy < div; dy++) for (int dx = 0; dx < div; dx++) {
        int X = x0 + x * div + dx, Y = y0 + y * div + dy; double s = Seat(px[Y * W + X]);
        for (int k = 0; holes != null && k < holes.Length; k += 3) { double ex = X - holes[k], ey = Y - holes[k + 1]; if (ex * ex + ey * ey < holes[k + 2] * holes[k + 2]) s = 0; }
        a += s;
      }
      a /= div * div; int A = (int)Math.Round(a * 255); sum += A;
      o[y * w + x] = (A << 24) | 0xFFFFFF;
    }
    using (var b = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
      var d = b.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
      Marshal.Copy(o, 0, d.Scan0, o.Length); b.UnlockBits(d); b.Save(path, ImageFormat.Png);
    }
    return string.Format("{0}x{1} mean={2:F2}", w, h, sum / 255.0 / (w * h));
  }
  // Preview: original with non-seat darkened, seats tinted red
  public static void Preview(string path, int x0, int y0, int x1, int y1) {
    int w = x1 - x0, h = y1 - y0; int[] o = new int[w * h];
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
      int c = px[(y + y0) * W + x + x0]; double s = Seat(c);
      int r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
      r = (int)(r * (1 - s) * .5 + 255 * s); g = (int)(g * (1 - s) * .5 + 40 * s); b = (int)(b * (1 - s) * .5 + 40 * s);
      o[y * w + x] = (255 << 24) | (r << 16) | (g << 8) | b;
    }
    using (var bm = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
      var d = bm.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
      Marshal.Copy(o, 0, d.Scan0, o.Length); bm.UnlockBits(d); bm.Save(path, ImageFormat.Png);
    }
  }
}
