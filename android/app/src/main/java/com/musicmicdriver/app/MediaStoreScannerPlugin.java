package com.musicmicdriver.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(
    name = "MediaStoreScanner",
    permissions = {
        @Permission(
            alias = "audio",
            strings = {
                Manifest.permission.READ_MEDIA_AUDIO
            }
        ),
        @Permission(
            alias = "storage",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE
            }
        )
    }
)
public class MediaStoreScannerPlugin extends Plugin {

    private static final String[] AUDIO_EXTS = {
        ".mp3", ".wav", ".wave", ".flac", ".m4a", ".aac", ".ogg", ".oga",
        ".opus", ".wma", ".aiff", ".aif", ".m4b", ".3gp", ".amr"
    };

    @PluginMethod
    public void scanAllAudio(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_MEDIA_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                requestPermissionForAlias("audio", call, "audioPermissionCallback");
                return;
            }
        } else {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                requestPermissionForAlias("storage", call, "audioPermissionCallback");
                return;
            }
        }

        // Fresh downloads often missing from MediaStore until rescanned
        new Thread(() -> {
            try {
                rescanPublicAudioFolders();
            } catch (Exception ignored) {}
            runQueryOnUi(call);
        }, "mm-media-rescan").start();
    }

    @PermissionCallback
    private void audioPermissionCallback(PluginCall call) {
        new Thread(() -> {
            try {
                rescanPublicAudioFolders();
            } catch (Exception ignored) {}
            runQueryOnUi(call);
        }, "mm-media-rescan").start();
    }

    private void runQueryOnUi(PluginCall call) {
        android.app.Activity act = getActivity();
        if (act != null) {
            act.runOnUiThread(() -> queryAndReturnAudio(call));
        } else {
            queryAndReturnAudio(call);
        }
    }

    /** Walk Downloads / Music / Documents / Zalo-ish folders and force MediaStore index. */
    private void rescanPublicAudioFolders() {
        List<String> paths = new ArrayList<>();
        File base = Environment.getExternalStorageDirectory();
        File[] roots = new File[] {
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC),
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS),
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PODCASTS),
            base != null ? new File(base, "Download") : null,
            base != null ? new File(base, "Downloads") : null,
            base != null ? new File(base, "Music") : null,
            base != null ? new File(base, "Zalo") : null,
            base != null ? new File(base, "Telegram") : null,
            base != null ? new File(base, "Movies") : null
        };
        for (File root : roots) {
            collectAudioFiles(root, 0, 5, paths, 2500);
        }
        if (paths.isEmpty()) return;

        CountDownLatch latch = new CountDownLatch(1);
        AtomicInteger left = new AtomicInteger(paths.size());
        String[] arr = paths.toArray(new String[0]);
        try {
            MediaScannerConnection.scanFile(getContext(), arr, null, (path, uri) -> {
                if (left.decrementAndGet() <= 0) latch.countDown();
            });
            latch.await(12, TimeUnit.SECONDS);
        } catch (Exception ignored) {
            latch.countDown();
        }
    }

    private void collectAudioFiles(File dir, int depth, int maxDepth, List<String> out, int maxFiles) {
        if (dir == null || !dir.exists() || !dir.isDirectory() || depth > maxDepth || out.size() >= maxFiles) return;
        File[] kids = dir.listFiles();
        if (kids == null) return;
        for (File f : kids) {
            if (out.size() >= maxFiles) return;
            if (f == null) continue;
            String name = f.getName();
            if (name.startsWith(".")) continue;
            if (f.isDirectory()) {
                String lower = name.toLowerCase(Locale.US);
                if (lower.equals("android") || lower.equals("data") || lower.equals("obb")
                    || lower.equals("cache") || lower.equals("thumbnails")) continue;
                collectAudioFiles(f, depth + 1, maxDepth, out, maxFiles);
            } else if (f.isFile() && f.length() > 512 && isAudioName(name)) {
                out.add(f.getAbsolutePath());
            }
        }
    }

    private boolean isAudioName(String name) {
        String lower = name.toLowerCase(Locale.US);
        for (String ext : AUDIO_EXTS) {
            if (lower.endsWith(ext)) return true;
        }
        return false;
    }

    private void queryAndReturnAudio(PluginCall call) {
        JSArray songs = new JSArray();
        Set<String> seen = new HashSet<>();
        ContentResolver resolver = getContext().getContentResolver();

        Uri collection;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL);
        } else {
            collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        }

        String[] projection = new String[] {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DATA,
            MediaStore.Audio.Media.SIZE,
            MediaStore.Audio.Media.DATE_ADDED,
            MediaStore.Audio.Media.ALBUM_ID,
            MediaStore.Audio.Media.MIME_TYPE
        };

        // Include Downloads / Zalo / any audio mime — not only IS_MUSIC library tracks
        String selection =
            "(" + MediaStore.Audio.Media.IS_MUSIC + " != 0)"
            + " OR (" + MediaStore.Audio.Media.MIME_TYPE + " LIKE 'audio/%')"
            + " OR (" + MediaStore.Audio.Media.DISPLAY_NAME + " LIKE '%.mp3')"
            + " OR (" + MediaStore.Audio.Media.DISPLAY_NAME + " LIKE '%.m4a')"
            + " OR (" + MediaStore.Audio.Media.DISPLAY_NAME + " LIKE '%.flac')"
            + " OR (" + MediaStore.Audio.Media.DISPLAY_NAME + " LIKE '%.wav')"
            + " OR (" + MediaStore.Audio.Media.DISPLAY_NAME + " LIKE '%.aac')"
            + " OR (" + MediaStore.Audio.Media.DISPLAY_NAME + " LIKE '%.ogg')"
            + " OR (" + MediaStore.Audio.Media.DISPLAY_NAME + " LIKE '%.opus')"
            + " OR (" + MediaStore.Audio.Media.DATA + " LIKE '%.mp3')"
            + " OR (" + MediaStore.Audio.Media.DATA + " LIKE '%.m4a')"
            + " OR (" + MediaStore.Audio.Media.DATA + " LIKE '%.flac')"
            + " OR (" + MediaStore.Audio.Media.DATA + " LIKE '%.wav')"
            + " OR (" + MediaStore.Audio.Media.DATA + " LIKE '%.aac')"
            + " OR (" + MediaStore.Audio.Media.DATA + " LIKE '%.ogg')"
            + " OR (" + MediaStore.Audio.Media.DATA + " LIKE '%.opus')";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            selection = "(" + selection + ") AND (" + MediaStore.Audio.Media.IS_PENDING + " = 0)";
        }

        String sortOrder = MediaStore.Audio.Media.DATE_ADDED + " DESC";

        try (Cursor cursor = resolver.query(collection, projection, selection, null, sortOrder)) {
            if (cursor != null) {
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                int displayNameColumn = cursor.getColumnIndex(MediaStore.Audio.Media.DISPLAY_NAME);
                int titleColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                int artistColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                int albumColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                int durationColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                int dataColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA);
                int sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE);
                int dateAddedColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_ADDED);
                int albumIdColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID);

                while (cursor.moveToNext()) {
                    long id = cursor.getLong(idColumn);
                    String key = "id:" + id;
                    if (seen.contains(key)) continue;
                    seen.add(key);

                    String displayName = displayNameColumn >= 0 ? cursor.getString(displayNameColumn) : null;
                    String title = cursor.getString(titleColumn);
                    String artist = cursor.getString(artistColumn);
                    String album = cursor.getString(albumColumn);
                    long duration = cursor.getLong(durationColumn);
                    String path = cursor.getString(dataColumn);
                    long size = cursor.getLong(sizeColumn);
                    long dateAdded = cursor.getLong(dateAddedColumn);
                    long albumId = cursor.getLong(albumIdColumn);

                    String fileName = displayName;
                    if (fileName == null || fileName.trim().isEmpty()) {
                        if (path != null) {
                            int slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
                            fileName = slash >= 0 ? path.substring(slash + 1) : path;
                        } else {
                            fileName = (title != null ? title : "track_" + id) + ".mp3";
                        }
                    }

                    // Do NOT require File.exists(path) — DATA is often null on Android 10+
                    // but contentUri still plays. Skipping path-null dropped Downloads tracks.
                    if (path != null) {
                        try {
                            File f = new File(path);
                            if (f.exists()) {
                                long len = f.length();
                                if (len > 0 && size <= 0) size = len;
                                if (len > 0 && len <= 512) continue;
                            }
                        } catch (Exception ignored) {}
                    }
                    if (size > 0 && size <= 512) continue;

                    Uri contentUri = ContentUris.withAppendedId(collection, id);
                    Uri albumArtUri = ContentUris.withAppendedId(
                        Uri.parse("content://media/external/audio/albumart"), albumId);

                    if (duration <= 0 && size > 0) {
                        duration = (size / 20000L) * 1000L;
                    }

                    String niceTitle = (title != null && !title.trim().isEmpty())
                        ? title.trim()
                        : fileName.replaceFirst("[.][^.]+$", "");

                    JSObject song = new JSObject();
                    song.put("id", "native_" + id);
                    song.put("title", niceTitle);
                    song.put("artist", (artist != null && !artist.equals("<unknown>") && !artist.trim().isEmpty()) ? artist.trim() : "Music MIC Driver");
                    song.put("album", (album != null && !album.equals("<unknown>") && !album.trim().isEmpty()) ? album.trim() : "Music MIC Driver");
                    song.put("duration", duration > 0 ? (double) (duration / 1000.0) : 0);
                    song.put("path", path != null ? path : "");
                    song.put("contentUri", contentUri.toString());
                    song.put("albumArtUri", albumArtUri.toString());
                    song.put("size", size);
                    song.put("fileName", fileName);
                    song.put("addedAt", dateAdded > 0 ? (dateAdded * 1000L) : System.currentTimeMillis());

                    songs.put(song);
                }
            }
        } catch (Exception e) {
            call.reject("Failed to query MediaStore: " + e.getMessage(), e);
            return;
        }

        JSObject result = new JSObject();
        result.put("songs", songs);
        result.put("count", songs.length());
        call.resolve(result);
    }
}
