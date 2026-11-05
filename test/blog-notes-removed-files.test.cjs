'use strict';

/**
 * The illustrations skill and the seo folder were removed. The blog's code and
 * notes must say where their settings live, not point at files that are gone.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

for (const file of ['blog/media-src/scene-lib.js', 'blog/src/_data/site.js', 'blog/BLOG_README.md', 'docs/sitemap.xml']) {
  test(`${file} points at no removed file`, () => {
    // Value: protects=blog notes name only files that exist; fails_when=a note brings back a path to the removed skill or seo files; why_new=nothing else reads these comments; seam=none; no_claim=the blog builds
    assert.doesNotMatch(read(file), /ian-xiaohei-illustrations|SEO_METADATA|BLOG_IDEAS/);
  });
}
