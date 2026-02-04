#!/usr/bin/env python3
"""
Extract all 95 SFX from Pokemon Trading Card Game (GB) ROM.

This script uses PyBoy to emulate the ROM, triggers each SFX by writing
to the game's memory, records the audio output, and saves as MP3 files.

Usage:
    python tools/extract_sfx.py --output public/sfx/
"""

import argparse
import os
import sys
import struct
import wave
import subprocess
from pathlib import Path

# Add user local bin to PATH for ffmpeg
os.environ['PATH'] = os.path.expanduser('~/bin') + ':' + os.environ.get('PATH', '')

import numpy as np

try:
    from pyboy import PyBoy
except ImportError:
    print("Error: PyBoy not installed. Run: pip install pyboy")
    sys.exit(1)

# Memory addresses from poketcg disassembly
ADDR_CUR_SFX_ID = 0xDD82      # wCurSfxID
ADDR_SFX_PRIORITY = 0xDD83    # wSfxPriority
ADDR_CUR_SONG_ID = 0xDD80     # wCurSongID
ADDR_MUSIC_PAUSE = 0xDDF2     # Music pause flag (1 = pause music, SFX still plays)

# SFX definitions from sfx_constants.asm
# Format: (id, name, estimated_frames)
# Most SFX are 30-120 frames (~0.5-2 seconds)
SFX_LIST = [
    (0x01, "cursor", 15),
    (0x02, "confirm", 20),
    (0x03, "cancel", 20),
    (0x04, "denied", 30),
    (0x05, "unused_05", 30),
    (0x06, "unused_06", 30),
    (0x07, "card_shuffle", 60),
    (0x08, "place_prize", 45),
    (0x09, "unused_09", 30),
    (0x0A, "unused_0a", 30),
    (0x0B, "coin_toss", 45),
    (0x0C, "warp", 60),
    (0x0D, "unused_0d", 30),
    (0x0E, "unused_0e", 30),
    (0x0F, "pokemon_dome_doors", 90),
    (0x10, "legendary_cards", 120),
    (0x11, "glow", 60),
    (0x12, "paralysis", 45),
    (0x13, "sleep", 60),
    (0x14, "confusion", 60),
    (0x15, "poison", 45),
    (0x16, "single_hit", 30),
    (0x17, "big_hit", 45),
    (0x18, "thunder_shock", 45),
    (0x19, "lightning", 60),
    (0x1A, "border_spark", 45),
    (0x1B, "big_lightning", 90),
    (0x1C, "small_flame", 45),
    (0x1D, "big_flame", 60),
    (0x1E, "fire_spin", 90),
    (0x1F, "dive_bomb", 60),
    (0x20, "water_jets", 60),
    (0x21, "water_gun", 45),
    (0x22, "whirlpool", 90),
    (0x23, "hydro_pump", 90),
    (0x24, "blizzard", 90),
    (0x25, "psychic", 60),
    (0x26, "leer", 45),
    (0x27, "beam", 60),
    (0x28, "hyper_beam", 120),
    (0x29, "rock_throw", 45),
    (0x2A, "stone_barrage", 60),
    (0x2B, "punch", 30),
    (0x2C, "stretch_kick", 45),
    (0x2D, "slash", 30),
    (0x2E, "sonicboom", 60),
    (0x2F, "fury_swipes", 60),
    (0x30, "drill", 90),
    (0x31, "pot_smash", 45),
    (0x32, "bonemerang", 60),
    (0x33, "seismic_toss", 90),
    (0x34, "needles", 45),
    (0x35, "white_gas", 60),
    (0x36, "powder", 45),
    (0x37, "goo", 60),
    (0x38, "bubbles", 60),
    (0x39, "string_shot", 60),
    (0x3A, "boyfriends", 60),
    (0x3B, "lure", 45),
    (0x3C, "toxic", 60),
    (0x3D, "confuse_ray", 60),
    (0x3E, "sing", 90),
    (0x3F, "supersonic", 60),
    (0x40, "petal_dance", 90),
    (0x41, "protect", 60),
    (0x42, "barrier", 60),
    (0x43, "speed", 45),
    (0x44, "whirlwind", 60),
    (0x45, "cry", 45),
    (0x46, "question_mark", 30),
    (0x47, "selfdestruct", 90),
    (0x48, "big_selfdestruct", 120),
    (0x49, "heal", 60),
    (0x4A, "drain", 60),
    (0x4B, "dark_gas", 60),
    (0x4C, "healing_wind", 90),
    (0x4D, "bench_whirlwind", 60),
    (0x4E, "expand", 60),
    (0x4F, "cat_punch", 45),
    (0x50, "thunder_wave", 60),
    (0x51, "firegiver", 120),
    (0x52, "thunderpunch", 60),
    (0x53, "fire_punch", 60),
    (0x54, "coin_toss_heads", 30),
    (0x55, "coin_toss_tails", 30),
    (0x56, "save_game", 60),
    (0x57, "player_walk_map", 30),
    (0x58, "intro_orb", 90),
    (0x59, "intro_orb_swoop", 60),
    (0x5A, "intro_orb_title", 90),
    (0x5B, "intro_orb_scatter", 60),
    (0x5C, "firegiver_start", 60),
    (0x5D, "receive_card_pop", 120),
    (0x5E, "pokemon_evolution", 120),
    (0x5F, "unused_5f", 30),
]

SAMPLE_RATE = 44100

# Game Boy sound hardware registers
ADDR_NR10 = 0xFF10  # Channel 1 sweep
ADDR_NR11 = 0xFF11  # Channel 1 length/duty
ADDR_NR12 = 0xFF12  # Channel 1 envelope
ADDR_NR13 = 0xFF13  # Channel 1 freq low
ADDR_NR14 = 0xFF14  # Channel 1 freq high/control

ADDR_NR21 = 0xFF16  # Channel 2 length/duty
ADDR_NR22 = 0xFF17  # Channel 2 envelope
ADDR_NR23 = 0xFF18  # Channel 2 freq low
ADDR_NR24 = 0xFF19  # Channel 2 freq high/control

ADDR_NR30 = 0xFF1A  # Channel 3 DAC enable
ADDR_NR31 = 0xFF1B  # Channel 3 length
ADDR_NR32 = 0xFF1C  # Channel 3 volume
ADDR_NR33 = 0xFF1D  # Channel 3 freq low
ADDR_NR34 = 0xFF1E  # Channel 3 freq high/control

ADDR_NR41 = 0xFF20  # Channel 4 length
ADDR_NR42 = 0xFF21  # Channel 4 envelope
ADDR_NR43 = 0xFF22  # Channel 4 polynomial
ADDR_NR44 = 0xFF23  # Channel 4 control

ADDR_NR50 = 0xFF24  # Master volume
ADDR_NR51 = 0xFF25  # Channel panning
ADDR_NR52 = 0xFF26  # Master sound enable


def reset_sound_channels(pyboy):
    """Reset all sound channel registers to clean state."""
    # Set envelope to 0 (silence) for channels 1, 2, 4
    # This stops any ongoing notes cleanly
    pyboy.memory[ADDR_NR12] = 0x00  # Channel 1 envelope = 0 (silent)
    pyboy.memory[ADDR_NR22] = 0x00  # Channel 2 envelope = 0 (silent)
    pyboy.memory[ADDR_NR42] = 0x00  # Channel 4 envelope = 0 (silent)

    # Channel 3 (wave) - disable DAC
    pyboy.memory[ADDR_NR30] = 0x00  # DAC off

    # Trigger channels to apply the envelope changes
    pyboy.memory[ADDR_NR14] = 0x80  # Restart channel 1
    pyboy.memory[ADDR_NR24] = 0x80  # Restart channel 2
    pyboy.memory[ADDR_NR44] = 0x80  # Restart channel 4

    # Reset sweep and duty
    pyboy.memory[ADDR_NR10] = 0x00  # No sweep
    pyboy.memory[ADDR_NR11] = 0x00  # Reset duty/length
    pyboy.memory[ADDR_NR21] = 0x00  # Reset duty/length

    # Ensure master volume and panning are normal
    pyboy.memory[ADDR_NR50] = 0x77  # Max volume both speakers
    pyboy.memory[ADDR_NR51] = 0xFF  # All channels to both speakers


def check_ffmpeg():
    """Check if ffmpeg is available."""
    try:
        result = subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True)
        return result.returncode == 0
    except FileNotFoundError:
        # Try with full path
        ffmpeg_path = os.path.expanduser('~/bin/ffmpeg')
        if os.path.exists(ffmpeg_path):
            return True
        return False


def get_ffmpeg_path():
    """Get the path to ffmpeg."""
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True)
        return 'ffmpeg'
    except FileNotFoundError:
        return os.path.expanduser('~/bin/ffmpeg')


def samples_to_wav(samples: np.ndarray, filename: str, sample_rate: int = SAMPLE_RATE):
    """Save audio samples to a WAV file."""
    # Convert int8 stereo to int16 for WAV
    # PyBoy outputs int8 stereo, we need to scale to int16
    samples_16 = (samples.astype(np.int16) * 256).clip(-32768, 32767).astype(np.int16)

    with wave.open(filename, 'wb') as wav:
        wav.setnchannels(2)  # Stereo
        wav.setsampwidth(2)  # 16-bit
        wav.setframerate(sample_rate)
        wav.writeframes(samples_16.tobytes())


def wav_to_mp3(wav_path: str, mp3_path: str):
    """Convert WAV to MP3 using ffmpeg."""
    ffmpeg = get_ffmpeg_path()
    cmd = [
        ffmpeg, '-y', '-i', wav_path,
        '-codec:a', 'libmp3lame',
        '-qscale:a', '2',  # High quality VBR
        '-ar', str(SAMPLE_RATE),
        mp3_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"FFmpeg error: {result.stderr}")
        return False
    return True


def trim_silence(samples: np.ndarray, threshold: int = 2, min_samples: int = 1000) -> np.ndarray:
    """Trim leading and trailing silence from audio samples."""
    # Find first non-silent sample
    abs_samples = np.abs(samples).max(axis=1)
    non_silent = np.where(abs_samples > threshold)[0]

    if len(non_silent) == 0:
        # All silence, return a small portion
        return samples[:min_samples]

    start = max(0, non_silent[0] - 100)  # Keep 100 samples before first sound
    end = min(len(samples), non_silent[-1] + SAMPLE_RATE // 4)  # Keep 0.25s after last sound

    result = samples[start:end]
    if len(result) < min_samples:
        return samples[:min_samples]
    return result


def extract_sfx(rom_path: str, output_dir: str, skip_unused: bool = False, verbose: bool = True):
    """Extract all SFX from the ROM."""

    if not os.path.exists(rom_path):
        print(f"Error: ROM file not found: {rom_path}")
        return False

    if not check_ffmpeg():
        print("Error: ffmpeg not found. Please install it or download static binary.")
        return False

    os.makedirs(output_dir, exist_ok=True)
    temp_dir = os.path.join(output_dir, '.temp')
    os.makedirs(temp_dir, exist_ok=True)

    print(f"Loading ROM: {rom_path}")
    pyboy = PyBoy(
        rom_path,
        window='null',  # Headless mode
        sound_emulated=True,
        sound_sample_rate=SAMPLE_RATE,
    )

    # Let the game boot and get to title screen where sound system is fully initialized
    print("Initializing game (waiting for title screen)...")
    for _ in range(700):  # ~12 seconds - past intro to title screen
        pyboy.tick()

    # Set the music pause flag - this silences music but allows SFX to still play
    print("Setting music pause flag...")
    pyboy.memory[ADDR_MUSIC_PAUSE] = 1

    # Reset hardware sound channels to clean state
    print("Resetting sound channels...")
    reset_sound_channels(pyboy)

    # Wait for changes to fully take effect
    for _ in range(60):  # ~1 second to settle
        pyboy.tick()

    extracted_count = 0
    failed = []

    for sfx_id, sfx_name, est_frames in SFX_LIST:
        if skip_unused and sfx_name.startswith('unused'):
            if verbose:
                print(f"  Skipping {sfx_name}")
            continue

        if verbose:
            print(f"  Extracting {sfx_id:02X}: {sfx_name}...", end=' ', flush=True)

        # Ensure music pause flag is still set
        pyboy.memory[ADDR_MUSIC_PAUSE] = 1

        # Reset hardware channels to clean state before each SFX
        reset_sound_channels(pyboy)

        # Clear any previous SFX and wait for clean state
        pyboy.memory[ADDR_CUR_SFX_ID] = 0x80  # Mark as finished
        pyboy.memory[ADDR_SFX_PRIORITY] = 0x00
        for _ in range(15):  # Wait a bit longer for channels to settle
            pyboy.tick()

        # Collect audio samples
        all_samples = []

        # Trigger the SFX
        pyboy.memory[ADDR_SFX_PRIORITY] = 0xFF  # High priority
        pyboy.memory[ADDR_CUR_SFX_ID] = sfx_id

        # Record audio for estimated duration + buffer
        frames_to_record = est_frames + 30
        samples_per_frame = SAMPLE_RATE // 60  # ~735 samples per frame

        for frame in range(frames_to_record):
            pyboy.tick()

            # Get audio buffer
            sound_arr = pyboy.sound.ndarray.copy()
            if len(sound_arr) > 0:
                all_samples.append(sound_arr)

            # Check if SFX finished early (wCurSfxID becomes 0x80)
            if frame > 10 and pyboy.memory[ADDR_CUR_SFX_ID] == 0x80:
                # Add a few more frames for tail
                for _ in range(15):
                    pyboy.tick()
                    sound_arr = pyboy.sound.ndarray.copy()
                    if len(sound_arr) > 0:
                        all_samples.append(sound_arr)
                break

        if not all_samples:
            if verbose:
                print("NO AUDIO")
            failed.append(sfx_name)
            continue

        # Concatenate all samples
        audio_data = np.vstack(all_samples)

        # Trim silence
        audio_data = trim_silence(audio_data)

        # Save to WAV then convert to MP3
        wav_path = os.path.join(temp_dir, f'{sfx_name}.wav')
        mp3_path = os.path.join(output_dir, f'{sfx_name}.mp3')

        samples_to_wav(audio_data, wav_path)

        if wav_to_mp3(wav_path, mp3_path):
            extracted_count += 1
            if verbose:
                duration_ms = len(audio_data) * 1000 // SAMPLE_RATE
                print(f"OK ({duration_ms}ms)")
        else:
            failed.append(sfx_name)
            if verbose:
                print("CONVERT FAILED")

    pyboy.stop()

    # Clean up temp files
    import shutil
    shutil.rmtree(temp_dir, ignore_errors=True)

    print(f"\nExtraction complete!")
    print(f"  Extracted: {extracted_count} SFX")
    print(f"  Failed: {len(failed)}")
    if failed:
        print(f"  Failed SFX: {', '.join(failed)}")

    return extracted_count > 0


def main():
    parser = argparse.ArgumentParser(
        description='Extract SFX from Pokemon TCG Game Boy ROM'
    )
    parser.add_argument(
        '--rom', '-r',
        default='pokemon_card_game.gb',
        help='Path to the ROM file (default: pokemon_card_game.gb)'
    )
    parser.add_argument(
        '--output', '-o',
        default='public/sfx',
        help='Output directory for MP3 files (default: public/sfx)'
    )
    parser.add_argument(
        '--skip-unused',
        action='store_true',
        help='Skip unused SFX entries'
    )
    parser.add_argument(
        '--quiet', '-q',
        action='store_true',
        help='Suppress per-file output'
    )

    args = parser.parse_args()

    success = extract_sfx(
        args.rom,
        args.output,
        skip_unused=args.skip_unused,
        verbose=not args.quiet
    )

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
