// electron-builder configuration for DeepTutor Desktop.
//
// The auto-update feed follows the repository that builds the app: in CI,
// GITHUB_REPOSITORY is "owner/repo"; locally it falls back to the placeholder
// below. To publish elsewhere, set UPDATE_FEED_OWNER / UPDATE_FEED_REPO, or
// swap the github provider for a generic HTTPS feed.

const repoSlug =
  process.env.GITHUB_REPOSITORY ||
  `${process.env.UPDATE_FEED_OWNER || "YOUR_GITHUB_USER"}/${process.env.UPDATE_FEED_REPO || "DeepTutor"}`;
const [owner, repo] = repoSlug.split("/");

module.exports = {
  appId: "com.deeptutor.desktop",
  productName: "DeepTutor",
  directories: {
    output: "release",
  },
  files: ["main.js", "updater.js", "package.json"],
  extraResources: [
    {
      from: "build/dist/deeptutor-backend",
      to: "backend/deeptutor-backend",
    },
    {
      from: "../DeepTutor/web/.next-deeptutor/standalone",
      to: "web",
    },
    {
      from: "build/node",
      to: "node",
    },
  ],
  publish: [
    {
      provider: "github",
      owner,
      repo,
      releaseType: "release",
    },
  ],
  mac: {
    category: "public.app-category.education",
    target: ["dir", "dmg"],
    icon: "build/icon.png",
    hardenedRuntime: false,
    identity: null, // set CSC_LINK / CSC_KEY_PASSWORD env vars to sign
  },
  dmg: {
    title: "DeepTutor",
  },
  win: {
    target: ["nsis", "zip"],
    icon: "build/icon.png",
    artifactName: "DeepTutor-${version}-win-x64.${ext}",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: "DeepTutor",
    createDesktopShortcut: true,
  },
  linux: {
    target: ["AppImage", "deb"],
    category: "Education",
    icon: "build/icon.png",
    artifactName: "DeepTutor-${version}-linux-x64.${ext}",
  },
};
