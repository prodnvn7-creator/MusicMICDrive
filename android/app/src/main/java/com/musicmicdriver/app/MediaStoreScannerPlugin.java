package com.musicmicdriver.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
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

        queryAndReturnAudio(call);
    }

    @PermissionCallback
    private void audioPermissionCallback(PluginCall call) {
        queryAndReturnAudio(call);
    }

    private void queryAndReturnAudio(PluginCall call) {
        JSArray songs = new JSArray();
        ContentResolver resolver = getContext().getContentResolver();

        Uri collection;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL);
        } else {
            collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        }

        String[] projection = new String[] {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DATA,
            MediaStore.Audio.Media.SIZE,
            MediaStore.Audio.Media.DATE_ADDED,
            MediaStore.Audio.Media.ALBUM_ID
        };

        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0 OR " +
                           MediaStore.Audio.Media.DATA + " LIKE '%.mp3' OR " +
                           MediaStore.Audio.Media.DATA + " LIKE '%.wav' OR " +
                           MediaStore.Audio.Media.DATA + " LIKE '%.flac' OR " +
                           MediaStore.Audio.Media.DATA + " LIKE '%.m4a' OR " +
                           MediaStore.Audio.Media.DATA + " LIKE '%.aac' OR " +
                           MediaStore.Audio.Media.DATA + " LIKE '%.ogg' OR " +
                           MediaStore.Audio.Media.DATA + " LIKE '%.opus'";
        String sortOrder = MediaStore.Audio.Media.DATE_ADDED + " DESC";

        try (Cursor cursor = resolver.query(collection, projection, selection, null, sortOrder)) {
            if (cursor != null) {
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
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
                    String title = cursor.getString(titleColumn);
                    String artist = cursor.getString(artistColumn);
                    String album = cursor.getString(albumColumn);
                    long duration = cursor.getLong(durationColumn);
                    String path = cursor.getString(dataColumn);
                    long size = cursor.getLong(sizeColumn);
                    long dateAdded = cursor.getLong(dateAddedColumn);
                    long albumId = cursor.getLong(albumIdColumn);

                    if (path != null) {
                        File f = new File(path);
                        if (f.exists() && f.length() > 512) {
                            Uri contentUri = ContentUris.withAppendedId(collection, id);
                            Uri albumArtUri = ContentUris.withAppendedId(Uri.parse("content://media/external/audio/albumart"), albumId);

                            // Skip MediaMetadataRetriever (very slow on 300+ tracks).
                            // Use MediaStore duration, else quick size estimate.
                            if (duration <= 0) {
                                long actualSize = size > 0 ? size : f.length();
                                if (actualSize > 0) {
                                    duration = (actualSize / 20000L) * 1000L;
                                }
                            }

                            JSObject song = new JSObject();
                            song.put("id", "native_" + id);
                            song.put("title", (title != null && !title.trim().isEmpty()) ? title.trim() : f.getName().replaceFirst("[.][^.]+$", ""));
                            song.put("artist", (artist != null && !artist.equals("<unknown>") && !artist.trim().isEmpty()) ? artist.trim() : "Music MIC Driver");
                            song.put("album", (album != null && !album.equals("<unknown>") && !album.trim().isEmpty()) ? album.trim() : "Music MIC Driver");
                            song.put("duration", duration > 0 ? (double)(duration / 1000.0) : 0);
                            song.put("path", path);
                            song.put("contentUri", contentUri.toString());
                            song.put("albumArtUri", albumArtUri.toString());
                            song.put("size", size > 0 ? size : f.length());
                            song.put("fileName", f.getName());
                            song.put("addedAt", dateAdded > 0 ? (dateAdded * 1000L) : f.lastModified());

                            songs.put(song);
                        }
                    }
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
