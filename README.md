# My Custom Formats

Experimental custom file formats. The first format is **XIMG**, a web-compatible custom image container.

## XIMG Viewer

The static viewer is hosted with GitHub Pages:

**https://sumankayal247.github.io/my-custom-formats/**

> The viewer UI is currently static. XIMG decoding will be implemented after the XIMG file specification is finalized.

## Enable GitHub Pages

1. Open this repository on GitHub.
2. Go to **Settings** → **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch **`main`**.
5. Select folder **`/ (root)`**.
6. Click **Save**.
7. Wait for GitHub Pages to deploy the site.
8. Open:
   `https://sumankayal247.github.io/my-custom-formats/`

Because `index.html` is already in the repository root, no build tool is required for this first version.

## Project direction

XIMG is intended to become a self-contained custom image container that can be decoded by the XIMG web viewer. The long-term goal is local browser decoding, so an XIMG file can be opened in the viewer without uploading the image to a server.
