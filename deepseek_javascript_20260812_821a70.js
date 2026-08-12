const fs = require('fs');
const { execSync } = require('child_process');

console.log('🔒 LOCKING ALL SOURCE FILES...\n');

// 1. Minify & obfuscate JavaScript
console.log('📦 Minifying script.js → script.min.js');
execSync(
  'npx terser script.js -o script.min.js --compress --mangle --mangle-props --keep-classnames --keep-fnames',
  { stdio: 'inherit' }
);

// 2. Minify CSS
console.log('🎨 Minifying style.css → style.min.css');
execSync(
  'npx postcss style.css --use cssnano -o style.min.css',
  { stdio: 'inherit' }
);

// 3. Minify HTML (both index.html and room.html)
console.log('📄 Minifying HTML files...');
const minifyHtml = (filename) => {
  const html = fs.readFileSync(filename, 'utf8');
  // Update references to .css and .js to .min versions
  let updated = html.replace(/style\.css/g, 'style.min.css');
  updated = updated.replace(/script\.js/g, 'script.min.js');
  // Minify the updated HTML
  const minified = execSync(
    `echo "${updated.replace(/"/g, '\\"')}" | npx html-minifier --collapse-whitespace --remove-comments --remove-optional-tags --remove-redundant-attributes --remove-script-type-attributes --remove-tag-whitespace --use-short-doctype --minify-css true --minify-js true`,
    { encoding: 'utf8' }
  );
  // Backup original
  if (!fs.existsSync('backup')) fs.mkdirSync('backup');
  fs.copyFileSync(filename, `backup/${filename}.bak`);
  // Write minified version back
  fs.writeFileSync(filename, minified);
};

minifyHtml('index.html');
minifyHtml('room.html');

console.log('\n✅ ALL FILES LOCKED!');
console.log('📦 Minified JS, CSS, and HTML are now in place.');
console.log('📂 Original files backed up to /backup folder.');
console.log('🚀 Now run: git add . && git commit -m "Locked sources" && git push');