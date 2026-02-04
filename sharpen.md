1. CSS image-rendering property
.card {
  image-rendering: -webkit-optimize-contrast; /* older Chrome */
  image-rendering: crisp-edges; /* can help with small text */
}
This tells the browser to preserve edges rather than smooth everything. Results vary—sometimes it helps text, sometimes it makes it worse. Worth testing.
2. CSS/SVG sharpening filter
.card {
  filter: contrast(1.05) saturate(1.1);
  /* or a subtle unsharp mask via SVG filter */
}


4. Serve full res, let browser downsample
Make sure you're not pre-shrinking. Browsers are actually pretty good at downscaling. Set the <img> to display size but keep src at full 1000x700. On retina displays this helps a lot.