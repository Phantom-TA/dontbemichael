# Don't Be Michael v0.2.9

**An AI office for your small business.** Pick your kind of business, pick your team, and Michael, your office manager, runs the floor while you run the business.

## What's new in 0.2.9

- **Failures report themselves.** A crash, a router or hook failure, or a team member stuck in a loop is filed for the developers on its own, as fixed fields only: no names, messages or files. Anything you can fix yourself is never sent, and DO_NOT_TRACK stops it.
- Report a problem lists your office's recent automatic reports.
- Home and Manager setup text is larger and easier to read.
- Hidden Claude calls start on Windows when the Claude path has a space.

Every feature, release by release: [docs/FEATURES.md](https://github.com/agentvivekkumar/dontbemichael/blob/main/docs/FEATURES.md)

## Download

| Platform | Download |
|---|---|
| Mac (Apple Silicon and Intel) | [`Dont-Be-Michael-0.2.9-mac-universal.dmg`](https://github.com/agentvivekkumar/dontbemichael/releases/latest/download/Dont-Be-Michael-0.2.9-mac-universal.dmg) |

<!-- windows -->
**Windows 11 (x64):** [`Dont-Be-Michael-0.2.9-win-x64-setup.exe`](https://github.com/agentvivekkumar/dontbemichael/releases/download/v0.2.9/Dont-Be-Michael-0.2.9-win-x64-setup.exe). ARM PCs aren't supported. This build is not yet signed with a Microsoft certificate: when Windows says **Windows protected your PC**, click **More info**, then **Run anyway**.
<!-- /windows -->

Linux will follow.

[Source code (zip)](https://github.com/agentvivekkumar/dontbemichael/archive/refs/tags/v0.2.9.zip) · [Source code (tar.gz)](https://github.com/agentvivekkumar/dontbemichael/archive/refs/tags/v0.2.9.tar.gz)

## Installing on your Mac

1. Open the downloaded `.dmg` and drag **Don't Be Michael** into your Applications folder.
2. Open it from Applications. The first time, macOS asks if you're sure you want to open an app downloaded from the internet. Click **Open**.

You only do this once. The app is signed with an Apple Developer ID and notarized by Apple.

You also need [Claude Code](https://docs.claude.com/en/docs/claude-code) installed and signed in.

When a new version comes out, the app tells you and links to the download. Install it the same way.

**On 0.2.5 or older?** Those versions can't install signed updates on their own: Restart to update keeps coming back. Download the `.dmg` above and install it the same way, once. Updates work as usual after that.
