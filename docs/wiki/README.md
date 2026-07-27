# Wiki pages — ready to publish

The files in this folder are the GitHub Wiki pages for the handover. The wiki is
a **separate git repository** from the code, which is why the images are copied
here rather than linked across from `docs/handover/`.

## Publishing

```bash
git clone https://github.com/jce-kehila-2026/kehila2026-lisan.wiki.git
cp -r docs/wiki/*.md docs/wiki/images kehila2026-lisan.wiki/
cd kehila2026-lisan.wiki && git add . && git commit -m "Add Lisan handover guide" && git push
```

Alternatively, paste each `.md` into the wiki editor on GitHub — but the images
must still be committed to the wiki repository for the relative paths to resolve.

## Pages

| File | Wiki page | Notes |
|---|---|---|
| `Home.md` | **Home** | Landing page; links to the handover guide |
| `Handover-Guide.md` | **Handover Guide** | Hebrew handover document for the nonprofit |
| `images/` | — | Screenshots referenced by relative path |

`Handover-Guide.md` is generated from `docs/handover/Lisan-Handover-He.md`.
Edit that file, not this copy, then regenerate so the two do not drift.

The existing course wiki skeletons are unchanged in `docs/wiki_templates/`.
