(() => {
    'use strict';
    const SETTINGS_KEY = 'absensi_ui_audio_settings_v1';
    const PLAYER_KEY = 'absensi_music_player_live_v1';
    const PLAYER_NAME = 'absensi_music_player_window';
    let audioContext = null;
    let channel = null;

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

    function openMusicPlayer() {
        let existing = 0;
        try { existing = Number(localStorage.getItem(PLAYER_KEY) || 0); } catch (_) {}
        if (existing && Date.now() - existing < 2500 && channel) {
            channel.postMessage({ type: 'focus-player' });
            return;
        }
        const theme = document.documentElement.dataset.theme || 'malam';
        const features = 'popup=yes,width=380,height=680,resizable=yes,scrollbars=yes';
        const player = window.open(`music_player.php?theme=${encodeURIComponent(theme)}`, PLAYER_NAME, features);
        if (player) { try { player.focus(); } catch (_) {} }
        else window.location.href = `music_player.php?theme=${encodeURIComponent(theme)}`;
    }

    function installFloatingButton() {
        if (/music_player\.php$/i.test(location.pathname) || document.getElementById('absensiMusicLauncher')) return;
        if (!document.getElementById('absensiAudioPrintStyle')) {
            const style = document.createElement('style');
            style.id = 'absensiAudioPrintStyle';
            style.textContent = '@media print { #absensiMusicLauncher { display:none !important; } }';
            document.head.appendChild(style);
        }
        const button = document.createElement('button');
        button.type = 'button'; button.id = 'absensiMusicLauncher'; button.setAttribute('aria-label', 'Buka pemutar musik');
        button.title = 'Buka musik — pemutar tetap berjalan saat pindah halaman';
        button.textContent = '♫';
        button.style.cssText = 'position:fixed;right:16px;bottom:18px;z-index:99990;width:52px;height:52px;border:0;border-radius:50%;background:#2563eb;color:#fff;font:700 25px Arial,sans-serif;box-shadow:0 5px 18px #0006;cursor:pointer;touch-action:manipulation';
        button.addEventListener('click', openMusicPlayer);
        document.body.appendChild(button);
    }

    document.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target || target.closest('[data-no-click-sound],#absensiMusicLauncher')) return;
        if (!target.closest('button,a,select,input[type="button"],input[type="submit"],input[type="checkbox"],input[type="radio"],[role="button"]')) return;
        playEffect();
    }, true);

    try { channel = new BroadcastChannel('absensi_music_player_channel_v1'); } catch (_) { channel = null; }
    if (/music_player\.php$/i.test(location.pathname)) {
        try { localStorage.setItem(PLAYER_KEY, String(Date.now())); } catch (_) {}
        const heartbeat = setInterval(() => { try { localStorage.setItem(PLAYER_KEY, String(Date.now())); } catch (_) {} }, 1200);
        window.addEventListener('pagehide', () => {
            clearInterval(heartbeat);
            try { localStorage.removeItem(PLAYER_KEY); } catch (_) {}
        }, { once: true });
        channel?.addEventListener('message', event => {
            if (event.data?.type === 'focus-player') { window.focus(); document.body.classList.add('player-ping'); setTimeout(() => document.body.classList.remove('player-ping'), 280); }
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
        setTheme: (theme) => channel?.postMessage({ type: 'theme-changed', theme }),
        openMusicPlayer
    };
})();
