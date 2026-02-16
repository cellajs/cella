/**
 * Workaround for Uppy bug where @transloadit/utils is published with workspace:* protocol
 * See: https://github.com/transloadit/uppy/issues/5454
 */
function readPackage(pkg) {
  // Fix transloadit package that has workspace:* dependency that leaked into npm
  if (pkg.name === 'transloadit' || pkg.name === '@uppy/transloadit') {
    if (pkg.dependencies?.['@transloadit/utils']?.startsWith('workspace:')) {
      pkg.dependencies['@transloadit/utils'] = '^4.1.8';
    }
  }
  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
