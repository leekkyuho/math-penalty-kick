using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Text;

public static class Proc {
  public static int W, H;
  public static string DebugPath = null;
  public static int MaxSampleY = 100000;
  public static int SensY0 = 905, SensY1 = 1048; public static double SensT = 45;
  public static int[] orig, bg;

  public static void Load(string p) {
    using (var b = new Bitmap(p)) {
      W = b.Width; H = b.Height; orig = new int[W * H];
      var d = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
      Marshal.Copy(d.Scan0, orig, 0, orig.Length); b.UnlockBits(d);
    }
    bg = (int[])orig.Clone();
  }

  static int R(int c) { return (c >> 16) & 255; }
  static int G(int c) { return (c >> 8) & 255; }
  static int B(int c) { return c & 255; }
  static int Pack(int a, int r, int g, int b) { return (a << 24) | (r << 16) | (g << 8) | b; }
  static int Clamp(int v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
  static int Mix(int a, int b, double t) {
    return Pack(255, Clamp((int)Math.Round(R(a) + (R(b) - R(a)) * t)), Clamp((int)Math.Round(G(a) + (G(b) - G(a)) * t)), Clamp((int)Math.Round(B(a) + (B(b) - B(a)) * t)));
  }
  static double Smooth(double e0, double e1, double x) { double t = Math.Max(0, Math.Min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

  public static string Dump(int x0, int x1, int y0, int y1, int step) {
    var sb = new StringBuilder();
    for (int y = y0; y <= y1; y += step) {
      sb.Append(y).Append(": ");
      for (int x = x0; x <= x1; x += step) { int c = orig[y * W + x]; sb.AppendFormat("{0},{1},{2} ", R(c), G(c), B(c)); }
      sb.AppendLine();
    }
    return sb.ToString();
  }

  // horizontal period of the net by autocorrelation (mean removed per row), parabolic peak
  public static double Period(int x0, int x1, int y0, int y1, int lmin, int lmax) {
    double[] acc = new double[lmax + 2];
    for (int y = y0; y < y1; y++) {
      int n = x1 - x0; double[] v = new double[n]; double m = 0;
      for (int i = 0; i < n; i++) { int c = orig[y * W + x0 + i]; v[i] = R(c) + G(c) + B(c); m += v[i]; }
      m /= n; for (int i = 0; i < n; i++) v[i] -= m;
      for (int L = lmin - 1; L <= lmax + 1; L++) { double s = 0; for (int i = 0; i + L < n; i++) s += v[i] * v[i + L]; acc[L] += s / (n - L); }
    }
    int best = lmin; for (int L = lmin; L <= lmax; L++) if (acc[L] > acc[best]) best = L;
    double a = acc[best - 1], b = acc[best], c2 = acc[best + 1];
    double off = 0.5 * (a - c2) / (a - 2 * b + c2);
    return best + off;
  }

  // Fill target columns [ax,bx) rows [y0,y1) from clean columns [cx,dx) using shifts that are multiples of P.
  public static void SegFill(int y0, int y1, int ax, int bx, int cx, int dx, double P, int blend) {
    bool fromLeft = dx <= ax;
    int Pc = (int)Math.Ceiling(P);
    int sw = (dx - cx) - Pc - blend - 1;
    if (sw < 8) throw new Exception("clean range too narrow");
    int nseg = (int)Math.Ceiling((bx - ax) / (double)sw);
    int[] shift = new int[nseg];
    for (int i = 0; i < nseg; i++) {
      int s = ax + i * sw, e = s + sw;
      int k;
      if (fromLeft) { k = (int)Math.Ceiling((e + blend - dx) / P); shift[i] = -(int)Math.Round(k * P); }
      else { k = (int)Math.Ceiling((cx - s) / P); shift[i] = (int)Math.Round(k * P); }
    }
    for (int y = y0; y < y1; y++) for (int x = ax; x < bx; x++) {
      int i = (x - ax) / sw; int sx = x + shift[i];
      int c = orig[y * W + Math.Max(cx, Math.Min(dx - 1, sx))];
      int pos = (x - ax) - i * sw;
      if (i > 0 && pos < blend) {
        int px2 = x + shift[i - 1];
        int c0 = orig[y * W + Math.Max(cx, Math.Min(dx - 1, px2))];
        c = Mix(c0, c, Smooth(0, blend, pos));
      }
      bg[y * W + x] = c;
    }
  }

  // Two-sided linear blend of a left shift and a right shift (non-periodic textures like grass)
  public static void TwoSide(int x0, int x1, int y0, int y1, int sl, int sr) {
    for (int y = y0; y < y1; y++) for (int x = x0; x < x1; x++) {
      double t = (x - x0) / (double)(x1 - x0);
      bg[y * W + x] = Mix(orig[y * W + x - sl], orig[y * W + x + sr], Smooth(0, 1, t));
    }
  }

  public static void VShift(int x0, int x1, int y0, int y1, int dy) {
    for (int y = y0; y < y1; y++) for (int x = x0; x < x1; x++) bg[y * W + x] = bg[(y - dy) * W + x];
  }

  // Erase text on the scoreboard: per row, linear interpolation between averaged edge columns
  public static void HInterp(int x0, int x1, int y0, int y1) {
    for (int y = y0; y < y1; y++) {
      int r1 = 0, g1 = 0, b1 = 0, r2 = 0, g2 = 0, b2 = 0;
      for (int k = 1; k <= 4; k++) { int c = orig[y * W + x0 - k]; r1 += R(c); g1 += G(c); b1 += B(c); c = orig[y * W + x1 + k - 1]; r2 += R(c); g2 += G(c); b2 += B(c); }
      int a = Pack(255, r1 / 4, g1 / 4, b1 / 4), b = Pack(255, r2 / 4, g2 / 4, b2 / 4);
      for (int x = x0; x < x1; x++) bg[y * W + x] = Mix(a, b, (x - x0) / (double)(x1 - x0));
    }
  }

  // Erase a round badge inside a periodic zone: left half from the left, right half from the right
  public static void Badge(int cx, int cy, int r, double P) {
    int bl = 12;
    int sh = (int)Math.Round(Math.Ceiling((r + bl) / P) * P);
    for (int y = cy - r; y <= cy + r; y++) for (int x = cx - r; x <= cx + r; x++) {
      double d = Math.Sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (d > r) continue;
      int L = orig[y * W + x - sh], Rr = orig[y * W + x + sh];
      int c = Mix(L, Rr, Smooth(cx - bl, cx + bl, x));
      double edge = Smooth(r - 3, r, d);
      bg[y * W + x] = Mix(c, orig[y * W + x], edge);
    }
  }

  // Frosted disk v2: per-row interpolation between the rim's left/right samples, then blur (no radial fan)
  public static void Frost2(int cx, int cy, int r, int blurR, int lighten) {
    int R0 = r + 6, pad = blurR * 3 + 4, x0 = cx - R0 - pad, y0 = cy - R0 - pad, n = 2 * (R0 + pad) + 1;
    int[] buf = new int[n * n];
    for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) buf[y * n + x] = bg[(y0 + y) * W + x0 + x];
    for (int Y = cy - R0; Y <= cy + R0; Y++) {
      double dy = Y - cy, half = Math.Sqrt(Math.Max(0, R0 * R0 - dy * dy));
      int xl = (int)Math.Floor(cx - half) - 2, xr = (int)Math.Ceiling(cx + half) + 2;
      int a = AvgAt(xl - 2, Y, 2), b = AvgAt(xr + 2, Y, 2);
      for (int X = xl; X <= xr; X++) { double t = (X - xl) / (double)Math.Max(1, xr - xl); buf[(Y - y0) * n + X - x0] = Mix(a, b, t); }
    }
    for (int pass = 0; pass < 3; pass++) {
      int[] tmp = new int[n * n];
      for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) { int r1 = 0, g1 = 0, b1 = 0, c = 0; for (int k = -blurR; k <= blurR; k++) { int xx = x + k; if (xx < 0 || xx >= n) continue; int p = buf[y * n + xx]; r1 += R(p); g1 += G(p); b1 += B(p); c++; } tmp[y * n + x] = Pack(255, r1 / c, g1 / c, b1 / c); }
      for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) { int r1 = 0, g1 = 0, b1 = 0, c = 0; for (int k = -blurR; k <= blurR; k++) { int yy = y + k; if (yy < 0 || yy >= n) continue; int p = tmp[yy * n + x]; r1 += R(p); g1 += G(p); b1 += B(p); c++; } buf[y * n + x] = Pack(255, r1 / c, g1 / c, b1 / c); }
    }
    for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) {
      int X = x0 + x, Y = y0 + y; double d = Math.Sqrt((X - cx) * (X - cx) + (Y - cy) * (Y - cy));
      if (d > r + 2) continue;
      int p = buf[y * n + x]; p = Pack(255, Clamp(R(p) + lighten), Clamp(G(p) + lighten), Clamp(B(p) + lighten));
      bg[Y * W + X] = Mix(p, bg[Y * W + X], Smooth(r - 2, r + 2, d));
    }
  }
  static int AvgAt(int x, int y, int r) { int rr = 0, gg = 0, bb = 0, c = 0; for (int dy = -r; dy <= r; dy++) for (int dx = -r; dx <= r; dx++) { int p = bg[(y + dy) * W + x + dx]; rr += R(p); gg += G(p); bb += B(p); c++; } return Pack(255, rr / c, gg / c, bb / c); }

  // ---------- premium pass ----------
  // Soft cumulus clouds painted only where the pixel is open sky
  public static void Clouds(double[] spec) {
    // spec: groups of (cx, cy, w, h, seed)
    double[] A = new double[W * H];
    for (int c = 0; c + 4 < spec.Length; c += 5) {
      double cx = spec[c], cy = spec[c + 1], w = spec[c + 2], h = spec[c + 3]; var rng = new Random((int)spec[c + 4]);
      int n = 9;
      for (int k = 0; k < n; k++) {
        double t = k / (double)(n - 1);
        double bx = cx + (t - 0.5) * w * 0.9 + (rng.NextDouble() - 0.5) * w * 0.12;
        double hump = Math.Sin(Math.PI * t);
        double by = cy - hump * h * 0.35 + (rng.NextDouble() - 0.5) * h * 0.15;
        double r = h * (0.35 + 0.45 * hump) * (0.85 + rng.NextDouble() * 0.3);
        int x0 = (int)Math.Max(0, bx - r * 2), x1 = (int)Math.Min(W - 1, bx + r * 2), y0 = (int)Math.Max(0, by - r * 2), y1 = (int)Math.Min(H - 1, by + r * 2);
        for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) {
          double dd = ((x - bx) * (x - bx) + (y - by) * (y - by)) / (r * r);
          double v = Math.Exp(-dd * 1.6);
          if (y > cy + h * 0.25) v *= Math.Max(0, 1 - (y - cy - h * 0.25) / (h * 0.3));   // flat-ish base
          A[y * W + x] += v;
        }
      }
    }
    for (int y = 0; y < Math.Min(H, 520); y++) for (int x = 0; x < W; x++) {
      int i = y * W + x; double a = Math.Min(1, A[i] * 1.15); if (a < 0.01) continue;
      int p = bg[i]; int r = R(p), g = G(p), b = B(p);
      double sky = Smooth(20, 55, b - r) * Smooth(200, 235, b) * Smooth(150, 185, g);   // open-sky test
      if (sky <= 0) continue;
      // shading: bright top, cool lavender-blue underside
      double shade = Math.Min(1, A[i] * 0.9);
      int cr = (int)(lerp(214, 255, shade)), cg = (int)(lerp(228, 255, shade)), cb = (int)(lerp(246, 255, shade));
      bg[i] = Mix(p, Pack(255, cr, cg, cb), a * sky * 0.92);
    }
  }
  static double lerp(double a, double b, double t) { return a + (b - a) * t; }

  // Depth of field: blur the far stands outside the goal frame
  public static void DepthOfField(int blurR, int passes) {
    double[] m = new double[W * H];
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
      double side = Math.Max(1 - Smooth(372, 404, x), Smooth(2394, 2426, x));
      double vert = Smooth(270, 330, y) * (1 - Smooth(1036, 1052, y));
      m[y * W + x] = side * vert;
    }
    int[] buf = (int[])bg.Clone();
    for (int pass = 0; pass < passes; pass++) {
      int[] tmp = new int[W * H];
      for (int y = 250; y < 1080; y++) for (int x = 0; x < W; x++) { int r = 0, g = 0, b = 0, c = 0; for (int k = -blurR; k <= blurR; k++) { int xx = Math.Max(0, Math.Min(W - 1, x + k)); int p = buf[y * W + xx]; r += R(p); g += G(p); b += B(p); c++; } tmp[y * W + x] = Pack(255, r / c, g / c, b / c); }
      for (int y = 250 + blurR; y < 1080 - blurR; y++) for (int x = 0; x < W; x++) { int r = 0, g = 0, b = 0, c = 0; for (int k = -blurR; k <= blurR; k++) { int p = tmp[(y + k) * W + x]; r += R(p); g += G(p); b += B(p); c++; } buf[y * W + x] = Pack(255, r / c, g / c, b / c); }
    }
    for (int i = 0; i < W * H; i++) if (m[i] > 0) bg[i] = Mix(bg[i], buf[i], m[i]);
  }

  // Perspective mowing stripes on the pitch in front of the goal line
  public static void Stripes(int[] edges, double light, double dark) {
    for (int y = edges[0]; y < H; y++) {
      int band = 0; for (int k = 0; k < edges.Length - 1; k++) if (y >= edges[k]) band = k;
      double f = band % 2 == 0 ? light : dark;
      // soften band edges
      int e0 = edges[band], e1 = band + 1 < edges.Length ? edges[band + 1] : H;
      double prev = band % 2 == 0 ? dark : light;
      double t = Smooth(e0 - 1, e0 + 7, y); if (band == 0) t = Smooth(e0, e0 + 10, y);
      double fac = band == 0 ? lerp(1, f, t) : lerp(prev, f, t);
      for (int x = 0; x < W; x++) { int p = bg[y * W + x]; bg[y * W + x] = Pack(255, Clamp((int)(R(p) * fac)), Clamp((int)(G(p) * fac)), Clamp((int)(B(p) * fac))); }
    }
  }

  public static void SaveBg(string path, int outW, long quality) {
    using (var full = ToBmp(bg, W, H)) using (var small = new Bitmap(outW, (int)Math.Round(H * outW / (double)W))) {
      using (var g = Graphics.FromImage(small)) {
        g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
        g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
        g.DrawImage(full, 0, 0, small.Width, small.Height);
      }
      var enc = Array.Find(ImageCodecInfo.GetImageEncoders(), e => e.MimeType == "image/jpeg");
      var ps = new EncoderParameters(1); ps.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
      small.Save(path, enc, ps);
    }
  }

  public static void SaveFullPng(string path) { using (var b = ToBmp(bg, W, H)) b.Save(path, ImageFormat.Png); }

  static Bitmap ToBmp(int[] a, int w, int h) {
    var b = new Bitmap(w, h, PixelFormat.Format32bppArgb);
    var d = b.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
    Marshal.Copy(a, 0, d.Scan0, a.Length); b.UnlockBits(d); return b;
  }

  // Keeper sprite: alpha from difference between original and reconstructed background
  public static void Sprite(string path, int x0, int y0, int x1, int y1, double t0, double t1, int greenFromY, double scale) {
    int w = x1 - x0, h = y1 - y0;
    double[] al = new double[w * h];
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
      int o = orig[(y + y0) * W + x + x0], b = bg[(y + y0) * W + x + x0];
      double d = Math.Abs(R(o) - R(b)) + Math.Abs(G(o) - G(b)) + Math.Abs(B(o) - B(b));
      double a = Smooth(t0, t1, d);
      if (y + y0 >= greenFromY) {
        // grass/shadow pixels: green dominant and not bright -> not keeper
        int r = R(o), g = G(o), bb = B(o);
        if (g > r + 18 && g > bb + 18) a = 0;
      }
      al[y * w + x] = a;
    }
    // keep the largest connected component of alpha>0.5
    int[] lab = new int[w * h]; int cur = 0, bestLab = 0, bestSize = 0;
    var st = new Stack<int>();
    for (int i = 0; i < w * h; i++) {
      if (al[i] <= 0.5 || lab[i] != 0) continue;
      cur++; int size = 0; st.Push(i); lab[i] = cur;
      while (st.Count > 0) {
        int p = st.Pop(); size++; int px = p % w, py = p / w;
        int[] nb = { p - 1, p + 1, p - w, p + w };
        bool[] ok = { px > 0, px < w - 1, py > 0, py < h - 1 };
        for (int k = 0; k < 4; k++) if (ok[k] && lab[nb[k]] == 0 && al[nb[k]] > 0.5) { lab[nb[k]] = cur; st.Push(nb[k]); }
      }
      if (size > bestSize) { bestSize = size; bestLab = cur; }
    }
    // background reachable from border (through non-keeper pixels) -> everything else is keeper (fills holes)
    bool[] outside = new bool[w * h];
    for (int i = 0; i < w * h; i++) {
      int px = i % w, py = i / w;
      if ((px == 0 || py == 0 || px == w - 1 || py == h - 1) && lab[i] != bestLab) { outside[i] = true; st.Push(i); }
    }
    while (st.Count > 0) {
      int p = st.Pop(); int px = p % w, py = p / w;
      int[] nb = { p - 1, p + 1, p - w, p + w };
      bool[] ok = { px > 0, px < w - 1, py > 0, py < h - 1 };
      for (int k = 0; k < 4; k++) if (ok[k] && !outside[nb[k]] && lab[nb[k]] != bestLab) { outside[nb[k]] = true; st.Push(nb[k]); }
    }
    // near-component: allow soft alpha only within 2px of the main component
    bool[] near = new bool[w * h];
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
      if (lab[y * w + x] != bestLab) continue;
      for (int dy = -2; dy <= 2; dy++) for (int dx = -2; dx <= 2; dx++) { int xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) near[yy * w + xx] = true; }
    }
    int[] outPx = new int[w * h];
    for (int i = 0; i < w * h; i++) {
      double a;
      if (lab[i] == bestLab) a = al[i];
      else if (!outside[i]) a = 1;
      else if (near[i]) a = al[i];
      else a = 0;
      if (lab[i] == bestLab && al[i] > 0.5) a = Math.Max(a, 0.5 + (al[i] - 0.5));
      int o = orig[(i / w + y0) * W + i % w + x0];
      outPx[i] = Pack((int)Math.Round(a * 255), R(o), G(o), B(o));
    }
    SaveScaled(outPx, w, h, path, scale);
  }

  // Frosted-glass disk: fill by radial projection from just outside the rim, then blur inside the disk
  public static void Frost(int cx, int cy, int r, int blurR, int lighten) {
    int R0 = r + 5; int x0 = cx - r - blurR - 2, y0 = cy - r - blurR - 2, n = 2 * (r + blurR + 2) + 1;
    int[] buf = new int[n * n];
    for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) {
      int X = x0 + x, Y = y0 + y; double dx = X - cx, dy = Y - cy, d = Math.Sqrt(dx * dx + dy * dy);
      if (d <= R0) { double a = Math.Atan2(dy, dx); int sx = (int)Math.Round(cx + R0 * Math.Cos(a)), sy = (int)Math.Round(cy + R0 * Math.Sin(a)); sy = Math.Min(sy, MaxSampleY); buf[y * n + x] = bg[sy * W + sx]; }
      else buf[y * n + x] = bg[Y * W + X];
    }
    for (int pass = 0; pass < 3; pass++) {
      int[] tmp = new int[n * n];
      for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) { int r1 = 0, g1 = 0, b1 = 0, c = 0; for (int k = -blurR; k <= blurR; k++) { int xx = x + k; if (xx < 0 || xx >= n) continue; int p = buf[y * n + xx]; r1 += R(p); g1 += G(p); b1 += B(p); c++; } tmp[y * n + x] = Pack(255, r1 / c, g1 / c, b1 / c); }
      for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) { int r1 = 0, g1 = 0, b1 = 0, c = 0; for (int k = -blurR; k <= blurR; k++) { int yy = y + k; if (yy < 0 || yy >= n) continue; int p = tmp[yy * n + x]; r1 += R(p); g1 += G(p); b1 += B(p); c++; } buf[y * n + x] = Pack(255, r1 / c, g1 / c, b1 / c); }
    }
    for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) {
      int X = x0 + x, Y = y0 + y; double d = Math.Sqrt((X - cx) * (X - cx) + (Y - cy) * (Y - cy));
      if (d > r + 2) continue;
      int p = buf[y * n + x]; p = Pack(255, Clamp(R(p) + lighten), Clamp(G(p) + lighten), Clamp(B(p) + lighten));
      bg[Y * W + X] = Mix(p, bg[Y * W + X], Smooth(r - 2, r + 2, d));
    }
  }

  // Keeper cut-out: colour rules + reconstruction diff, morphological opening, largest blob, hole fill
  public static string Sprite2(string path, int x0, int y0, int x1, int y1, double dT, int greenFromY, int openR) {
    int w = x1 - x0, h = y1 - y0; bool[] m = new bool[w * h];
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
      int o = orig[(y + y0) * W + x + x0], b = bg[(y + y0) * W + x + x0];
      int r = R(o), g = G(o), bb = B(o);
      double d = Math.Abs(r - R(b)) + Math.Abs(g - G(b)) + Math.Abs(bb - B(b));
      int Y = y + y0;
      int X = x + x0;
      bool sens = (X >= 1600 && X < 1692 && Y >= 900 && Y < 985) || (X >= 1440 && X < 1500 && Y >= 930 && Y < 962);
      if (sens && Y >= SensY0 && Y < SensY1) { d = 2 * Math.Abs(r - R(b)) + Math.Abs(g - G(b)) + 2 * Math.Abs(bb - B(b)); d *= 60.0 / SensT; }
      bool blue = bb > r + 35 && bb >= g;
      bool green = (y + y0) >= greenFromY && g > r + 15 && g > bb + 15;
      m[y * w + x] = d > dT && !blue && !green;
    }
    if (DebugPath != null) { int[] dbg = new int[w * h]; for (int i = 0; i < w * h; i++) dbg[i] = m[i] ? unchecked((int)0xFFFFFFFF) : unchecked((int)0xFF000000); using (var bm = ToBmp(dbg, w, h)) bm.Save(DebugPath, ImageFormat.Png); }
    m = Morph(m, w, h, openR, false); m = Morph(m, w, h, openR, true);
    int[] lab = new int[w * h]; int cur = 0, bestLab = 0, bestSize = 0; var st = new Stack<int>();
    var sizes = new Dictionary<int, int>();
    for (int i = 0; i < w * h; i++) {
      if (!m[i] || lab[i] != 0) continue; cur++; int size = 0; st.Push(i); lab[i] = cur;
      while (st.Count > 0) { int p = st.Pop(); size++; int px = p % w, py = p / w;
        if (px > 0 && m[p - 1] && lab[p - 1] == 0) { lab[p - 1] = cur; st.Push(p - 1); }
        if (px < w - 1 && m[p + 1] && lab[p + 1] == 0) { lab[p + 1] = cur; st.Push(p + 1); }
        if (py > 0 && m[p - w] && lab[p - w] == 0) { lab[p - w] = cur; st.Push(p - w); }
        if (py < h - 1 && m[p + w] && lab[p + w] == 0) { lab[p + w] = cur; st.Push(p + w); } }
      if (size > bestSize) { bestSize = size; bestLab = cur; }
      sizes[cur] = size;
    }
    bool[] keep = new bool[w * h]; for (int i = 0; i < w * h; i++) keep[i] = lab[i] != 0 && sizes[lab[i]] >= 700;
    keep = Morph(Morph(keep, w, h, 4, true), w, h, 4, false);
    if (DebugPath != null) { int[] dbg = new int[w * h]; for (int i = 0; i < w * h; i++) dbg[i] = keep[i] ? unchecked((int)0xFFFFFFFF) : m[i] ? unchecked((int)0xFFFF0000) : unchecked((int)0xFF000000); using (var bm = ToBmp(dbg, w, h)) bm.Save(DebugPath.Replace(".png", "2.png"), ImageFormat.Png); }
    bool[] outside = new bool[w * h];
    for (int i = 0; i < w * h; i++) { int px = i % w, py = i / w; if ((px == 0 || py == 0 || px == w - 1 || py == h - 1) && !keep[i]) { outside[i] = true; st.Push(i); } }
    while (st.Count > 0) { int p = st.Pop(); int px = p % w, py = p / w;
      if (px > 0 && !keep[p - 1] && !outside[p - 1]) { outside[p - 1] = true; st.Push(p - 1); }
      if (px < w - 1 && !keep[p + 1] && !outside[p + 1]) { outside[p + 1] = true; st.Push(p + 1); }
      if (py > 0 && !keep[p - w] && !outside[p - w]) { outside[p - w] = true; st.Push(p - w); }
      if (py < h - 1 && !keep[p + w] && !outside[p + w]) { outside[p + w] = true; st.Push(p + w); } }
    int minx = w, miny = h, maxx = 0, maxy = 0;
    double[] a = new double[w * h];
    for (int i = 0; i < w * h; i++) if (!outside[i]) { a[i] = 1; int px = i % w, py = i / w; minx = Math.Min(minx, px); maxx = Math.Max(maxx, px); miny = Math.Min(miny, py); maxy = Math.Max(maxy, py); }
    double[] a2 = new double[w * h];
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) { double s = 0; int c = 0; for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) { int xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; s += a[yy * w + xx]; c++; } a2[y * w + x] = s / c; }
    minx = Math.Max(0, minx - 2); miny = Math.Max(0, miny - 2); maxx = Math.Min(w - 1, maxx + 2); maxy = Math.Min(h - 1, maxy + 2);
    int tw = maxx - minx + 1, th = maxy - miny + 1; int[] outPx = new int[tw * th];
    for (int y = 0; y < th; y++) for (int x = 0; x < tw; x++) { int i = (y + miny) * w + x + minx; int o = orig[(y + miny + y0) * W + x + minx + x0]; outPx[y * tw + x] = Pack((int)Math.Round(a2[i] * 255), R(o), G(o), B(o)); }
    SaveScaled(outPx, tw, th, path, 1.0);
    return string.Format("keeper bbox x={0} y={1} w={2} h={3}", x0 + minx, y0 + miny, tw, th);
  }

  static bool[] Morph(bool[] m, int w, int h, int r, bool dilate) {
    bool[] o = new bool[w * h];
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
      bool v = !dilate;
      for (int dy = -r; dy <= r && v == !dilate; dy++) for (int dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue; int xx = x + dx, yy = y + dy;
        bool s = (xx >= 0 && yy >= 0 && xx < w && yy < h) && m[yy * w + xx];
        if (dilate && s) { v = true; break; } if (!dilate && !s) { v = false; break; }
      }
      o[y * w + x] = v;
    }
    return o;
  }

  public static void Ball(string path, double cx, double cy, double r, double scale) {
    int s = (int)Math.Ceiling(r * 2) + 4; int[] o = new int[s * s];
    double ox = cx - s / 2.0, oy = cy - s / 2.0;
    for (int y = 0; y < s; y++) for (int x = 0; x < s; x++) {
      double X = ox + x + 0.5, Y = oy + y + 0.5;
      double d = Math.Sqrt((X - cx) * (X - cx) + (Y - cy) * (Y - cy));
      double a = 1 - Smooth(r - 1.5, r + 0.5, d);
      int c = orig[(int)Y * W + (int)X];
      o[y * s + x] = Pack((int)Math.Round(a * 255), R(c), G(c), B(c));
    }
    SaveScaled(o, s, s, path, scale);
  }

  static void SaveScaled(int[] a, int w, int h, string path, double scale) {
    using (var b = ToBmp(a, w, h)) {
      if (scale == 1) { b.Save(path, ImageFormat.Png); return; }
      int nw = (int)Math.Round(w * scale), nh = (int)Math.Round(h * scale);
      using (var s = new Bitmap(nw, nh, PixelFormat.Format32bppArgb)) {
        using (var g = Graphics.FromImage(s)) {
          g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
          g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
          g.CompositingMode = System.Drawing.Drawing2D.CompositingMode.SourceCopy;
          g.DrawImage(b, 0, 0, nw, nh);
        }
        s.Save(path, ImageFormat.Png);
      }
    }
  }
}
