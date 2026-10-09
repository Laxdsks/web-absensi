(() => {
    'use strict';
    const SETTINGS_KEY = 'absensi_ui_audio_settings_v1';
    const PLAYER_KEY = 'absensi_music_player_live_v1';
    const PLAYER_NAME = 'absensi_music_player_window';
    const IS_PLAYER_PAGE = /music_player\.php$/i.test(location.pathname);
    let audioContext = null;
    let channel = null;
    let musicOverlay = null;
    let musicFrame = null;
    let applicationFrame = null;
    let scrollStyles = null;
    let applicationUrl = location.href;

    function readSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            return {
                effect: Math.max(1, Math.min(6, Number(saved.effect) || 1)),
                volume: Math.max(0, Math.min(100, Number(saved.volume ?? 25))),
                muted: Boolean(saved.muted)
            };
        } catch (_) { return { effect: 1, volume: 25, muted: false }; }
    }

    function writeSettings(settings) {
        const clean = {
            effect: Math.max(1, Math.min(6, Number(settings.effect) || 1)),
            volume: Math.max(0, Math.min(100, Number(settings.volume) || 0)),
            muted: Boolean(settings.muted)
        };
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(clean)); }
        catch (_) { /* Pengaturan tetap aktif untuk sesi halaman ini. */ }
        return clean;
    }

    function playEffect(which = readSettings().effect, force = false) {
        const settings = readSettings();
        if ((!force && settings.muted) || settings.volume <= 0) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        try {
            audioContext ||= new AudioContextClass();
            if (audioContext.state === 'suspended') audioContext.resume();
            const ctx = audioContext, now = ctx.currentTime;
            const master = Math.min(.16, settings.volume / 100 * .16);
            const notes = [
                [[760, 0, .055, 'sine', 1]],
                [[620, 0, .07, 'sine', .7], [880, .055, .07, 'sine', .7]],
                [[520, 0, .075, 'triangle', 1]],
                [[880, 0, .16, 'sine', .55], [1320, .012, .12, 'sine', .35]],
                [[430, 0, .075, 'triangle', .8], [680, .035, .075, 'sine', .5]],
                [[523, 0, .065, 'sine', .5], [659, .055, .065, 'sine', .5], [784, .11, .085, 'sine', .55]]
            ][Math.max(1, Math.min(6, Number(which) || 1)) - 1];
            notes.forEach(([frequency, delay, duration, type, level]) => {
                const osc = ctx.createOscillator(), gain = ctx.createGain(), start = now + delay;
                osc.type = type;
                osc.frequency.setValueAtTime(frequency, start);
                gain.gain.setValueAtTime(.0001, start);
                gain.gain.linearRampToValueAtTime(master * level, start + Math.min(.012, duration / 3));
                gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(start); osc.stop(start + duration + .01);
            });
        } catch (_) { /* Audio tidak tersedia pada perangkat ini. */ }
    }

    function parentMusicHost() {
        try {
            let scope = window.parent;
            for (let depth = 0; depth < 8 && scope !== window; depth++) {
                if (scope.AbsensiUIAudio?.ownsPersistentPlayer?.()) return scope.AbsensiUIAudio;
                if (scope.parent === scope) break;
                scope = scope.parent;
            }
        } catch (_) { /* Hanya bingkai pada situs yang sama yang boleh mengontrol musik. */ }
        return null;
    }

    function applicationDestination(value) {
        try {
            const url = new URL(value, location.href);
            const folder = new URL('.', location.href).pathname;
            const allowed = ['', 'index.php', 'data_siswa.php', 'absen.php', 'ujian.php'];
            return url.origin === location.origin && allowed.some(page => url.pathname === folder + page) ? url : null;
        } catch (_) { return null; }
    }

    function prepareApplicationFrame() {
        if (applicationFrame) return applicationFrame;
        applicationFrame = document.createElement('iframe');
        applicationFrame.id = 'absensiMusicApplicationFrame';
        applicationFrame.name = 'absensi_music_application_content';
        applicationFrame.title = 'Halaman aplikasi absensi';
        applicationFrame.hidden = true;
        applicationFrame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:#fff;z-index:2147483000';
        applicationFrame.addEventListener('load', () => {
            try {
                const destination = applicationDestination(applicationFrame.contentWindow.location.href);
                if (destination) applicationUrl = destination.href;
                const title = applicationFrame.contentDocument.title;
                if (title) document.title = title;
            } catch (_) {}
        });
        document.body.appendChild(applicationFrame);
        return applicationFrame;
    }

    function showApplicationFrame() {
        prepareApplicationFrame().hidden = false;
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
    }

    function navigateApplication(value) {
        const host = parentMusicHost();
        if (host) { host.navigateApplication(value); return; }
        const destination = applicationDestination(value);
        if (IS_PLAYER_PAGE && destination && typeof window.showMusicApplication === 'function') {
            window.showMusicApplication(destination.href);
        } else if (musicFrame && destination) {
            applicationUrl = destination.href;
            prepareApplicationFrame().src = applicationUrl;
            showApplicationFrame();
        } else window.location.assign(value);
    }

    function reloadApplication() {
        if (musicFrame) navigateApplication(applicationUrl);
        else window.location.reload();
    }

    function showEmbeddedMusicPlayer() {
        if (!musicFrame) {
            musicOverlay = document.createElement('div');
            musicOverlay.id = 'absensiMusicOverlay';
            musicOverlay.setAttribute('role', 'dialog');
            musicOverlay.setAttribute('aria-modal', 'true');
            musicOverlay.setAttribute('aria-label', 'Pemutar musik');
            musicOverlay.style.cssText = 'position:fixed;inset:0;z-index:2147483001;background:#0b1220';
            musicFrame = document.createElement('iframe');
            musicFrame.id = 'absensiMusicFrame';
            musicFrame.title = 'Pemutar musik';
            musicFrame.allow = 'autoplay';
            musicFrame.style.cssText = 'width:100%;height:100%;border:0;display:block';
            const url = new URL('music_player.php', location.href);
            url.searchParams.set('theme', document.documentElement.dataset.theme || 'malam');
            url.searchParams.set('embedded', '1');
            musicFrame.src = url.href;
            musicOverlay.appendChild(musicFrame);
            document.body.appendChild(musicOverlay);
        }
        if (!scrollStyles) scrollStyles = { html: document.documentElement.style.overflow, body: document.body.style.overflow };
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        musicOverlay.style.visibility = 'visible';
        musicOverlay.style.pointerEvents = 'auto';
        musicOverlay.setAttribute('aria-hidden', 'false');
        musicOverlay.inert = false;
        musicFrame.tabIndex = 0;
        const launcher = document.getElementById('absensiMusicLauncher');
        if (launcher) launcher.style.visibility = 'hidden';
    }

    function hideMusicPlayer() {
        const host = parentMusicHost();
        if (host) { host.hideMusicPlayer(); return; }
        if (IS_PLAYER_PAGE) { window.minimizeMusicView?.(); return; }
        if (!musicOverlay) return;
        // Bingkai dipertahankan: menyembunyikan panel tidak menghentikan elemen audio.
        musicOverlay.style.visibility = 'hidden';
        musicOverlay.style.pointerEvents = 'none';
        musicOverlay.setAttribute('aria-hidden', 'true');
        musicOverlay.inert = true;
        musicFrame.tabIndex = -1;
        if (!applicationFrame || applicationFrame.hidden) {
            document.documentElement.style.overflow = scrollStyles?.html || '';
            document.body.style.overflow = scrollStyles?.body || '';
        }
        scrollStyles = null;
        const launcher = document.getElementById('absensiMusicLauncher');
        if (launcher) { launcher.style.visibility = 'visible'; launcher.focus({ preventScroll: true }); }
    }

    function setTheme(theme) {
        if (!['malam', 'putih', 'samudra', 'senja'].includes(theme)) return;
        const host = parentMusicHost();
        if (host) { host.setTheme(theme); return; }
        if (IS_PLAYER_PAGE) document.documentElement.dataset.theme = theme;
        try { if (musicFrame?.contentDocument) musicFrame.contentDocument.documentElement.dataset.theme = theme; } catch (_) {}
        channel?.postMessage({ type: 'theme-changed', theme });
    }

    function openMusicPlayer() {
        const host = parentMusicHost();
        if (host) { host.openMusicPlayer(); return; }
        if (IS_PLAYER_PAGE) { window.restoreMusicView?.(); return; }
        // Android menggunakan panel dalam halaman agar WebView tidak menutup pemutar.
        if (musicFrame || window.Android || window.AndroidInterface || window.ReactNativeWebView || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) {
            showEmbeddedMusicPlayer();
            return;
        }
        let existing = 0;
        try { existing = Number(localStorage.getItem(PLAYER_KEY) || 0); } catch (_) {}
        if (existing && Date.now() - existing < 2500 && channel) {
            channel.postMessage({ type: 'focus-player' });
            return;
        }
        const theme = document.documentElement.dataset.theme || 'malam';
        const features = 'popup=yes,width=380,height=680,resizable=yes,scrollbars=yes';
        const playerUrl = `music_player.php?theme=${encodeURIComponent(theme)}&return_url=${encodeURIComponent(applicationUrl)}`;
        const player = window.open('', PLAYER_NAME, features);
        if (player) {
            try {
                if (/music_player\.php$/i.test(player.location.pathname)) player.restoreMusicView?.();
                else player.location.replace(playerUrl);
                player.focus();
            } catch (_) { player.location.href = playerUrl; }
        } else showEmbeddedMusicPlayer();
    }

    function installFloatingButton() {
        if (IS_PLAYER_PAGE || parentMusicHost() || document.getElementById('absensiMusicLauncher')) return;
        if (!document.getElementById('absensiAudioPrintStyle')) {
            const style = document.createElement('style');
            style.id = 'absensiAudioPrintStyle';
            style.textContent = '#absensiMusicApplicationFrame[hidden]{display:none!important}@media print { #absensiMusicLauncher,#absensiMusicOverlay,#absensiMusicApplicationFrame { display:none !important; } }';
            document.head.appendChild(style);
        }
        const button = document.createElement('button');
        button.type = 'button'; button.id = 'absensiMusicLauncher'; button.setAttribute('aria-label', 'Buka pemutar musik');
        button.title = 'Buka musik — pemutar tetap berjalan saat pindah halaman';
        button.textContent = '♫';
        button.style.cssText = 'position:fixed;right:16px;bottom:18px;z-index:2147483002;width:52px;height:52px;border:0;border-radius:50%;background:#2563eb;color:#fff;font:700 25px Arial,sans-serif;box-shadow:0 5px 18px #0006;cursor:pointer;touch-action:manipulation';
        button.addEventListener('click', openMusicPlayer);
        document.body.appendChild(button);
    }

    // Halaman kerja berpindah di bingkai lain; pemutar yang sudah hidup tetap berada di halaman induk.
    document.addEventListener('click', event => {
        if (!musicFrame || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
        if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self') || link.getAttribute('href').startsWith('#')) return;
        const destination = applicationDestination(link.href);
        if (!destination) return;
        event.preventDefault();
        navigateApplication(destination.href);
    });
    document.addEventListener('submit', event => {
        if (!musicFrame || event.defaultPrevented || !(event.target instanceof HTMLFormElement)) return;
        const form = event.target;
        if ((form.target && form.target !== '_self') || !applicationDestination(form.action || location.href)) return;
        form.target = prepareApplicationFrame().name;
        queueMicrotask(() => { if (!event.defaultPrevented) showApplicationFrame(); });
    });

    document.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target || target.closest('[data-no-click-sound],#absensiMusicLauncher')) return;
        if (!target.closest('button,a,select,input[type="button"],input[type="submit"],input[type="checkbox"],input[type="radio"],[role="button"]')) return;
        playEffect();
    }, true);

    try { channel = new BroadcastChannel('absensi_music_player_channel_v1'); } catch (_) { channel = null; }
    if (IS_PLAYER_PAGE) {
        try { localStorage.setItem(PLAYER_KEY, String(Date.now())); } catch (_) {}
        const heartbeat = setInterval(() => { try { localStorage.setItem(PLAYER_KEY, String(Date.now())); } catch (_) {} }, 1200);
        window.addEventListener('pagehide', () => {
            clearInterval(heartbeat);
            try { localStorage.removeItem(PLAYER_KEY); } catch (_) {}
        }, { once: true });
        channel?.addEventListener('message', event => {
            if (event.data?.type === 'focus-player') {
                const host = parentMusicHost();
                if (host) host.openMusicPlayer();
                else window.restoreMusicView?.();
                window.focus(); document.body.classList.add('player-ping'); setTimeout(() => document.body.classList.remove('player-ping'), 280);
            }
            if (event.data?.type === 'theme-changed' && ['malam','putih','samudra','senja'].includes(event.data.theme)) {
                document.documentElement.setAttribute('data-theme', event.data.theme);
            }
        });
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installFloatingButton, { once: true });
    } else installFloatingButton();

    window.AbsensiUIAudio = {
        readSettings,
        saveSettings: writeSettings,
        preview: (which) => playEffect(which, true),
        notify: () => playEffect(readSettings().effect),
        setTheme,
        openMusicPlayer,
        hideMusicPlayer,
        navigateApplication,
        reloadApplication,
        ownsPersistentPlayer: () => IS_PLAYER_PAGE || Boolean(musicFrame)
    };
})();
