import {
    Instrument,
    InstrumentParam,
    SourceKind,
    SourceParam,
} from "./components/com_audio_source.js";

export function play_note(audio: AudioContext, instr: Instrument, note: number, offset: number) {
    let time = audio.currentTime + offset;
    let total_duration = 0;

    let master = audio.createGain();
    master.gain.value = (instr[InstrumentParam.MasterGainAmount] / 9) ** 3;

    let lfa, lfo;
    if (instr[InstrumentParam.LFOEnabled]) {
        // Frequency is mapped to [0, 125].
        lfo = audio.createOscillator();
        lfo.type = instr[InstrumentParam.LFOType];
        lfo.frequency.value = (instr[InstrumentParam.LFOFreq] / 3) ** 3;

        // Amount is mapped to [27, 5832].
        lfa = audio.createGain();
        lfa.gain.value = (instr[InstrumentParam.LFOAmount] + 3) ** 3;

        lfo.connect(lfa);
    }

    if (instr[InstrumentParam.FilterEnabled]) {
        let filter = audio.createBiquadFilter();
        filter.type = instr[InstrumentParam.FilterType];
        filter.frequency.value = 2 ** instr[InstrumentParam.FilterFreq];
        filter.Q.value = instr[InstrumentParam.FilterQ] ** 1.5;
        if (lfa && instr[InstrumentParam.FilterDetuneLFO]) {
            lfa.connect(filter.detune);
        }

        master.connect(filter);
        filter.connect(audio.destination);
    } else {
        master.connect(audio.destination);
    }

    for (let source of instr[InstrumentParam.Sources]) {
        let amp = audio.createGain();
        amp.connect(master);

        // Gain Envelope

        let gain_amount = (source[SourceParam.GainAmount] / 9) ** 3;
        let gain_attack = (source[SourceParam.GainAttack] / 9) ** 3;
        let gain_sustain = (source[SourceParam.GainSustain] / 9) ** 3;
        let gain_release = (source[SourceParam.GainRelease] / 6) ** 3;
        let gain_duration = gain_attack + gain_sustain + gain_release;

        amp.gain.setValueAtTime(0, time);
        amp.gain.linearRampToValueAtTime(gain_amount, time + gain_attack);
        amp.gain.setValueAtTime(gain_amount, time + gain_attack + gain_sustain);
        amp.gain.exponentialRampToValueAtTime(0.00001, time + gain_duration);

        // XXX TypeScript doesn't recognize source[SourceParam.Kind] as the discriminant.
        if (source[0] === SourceKind.Oscillator) {
            let hfo = audio.createOscillator();
            hfo.type = source[SourceParam.OscillatorType];
            hfo.connect(amp);

            // Detune

            // [-1265,1265] i.e. one octave down and one octave up.
            hfo.detune.value = 3 * (source[SourceParam.DetuneAmount] - 7.5) ** 3;
            if (lfa && source[SourceParam.DetuneLFO]) {
                lfa.connect(hfo.detune);
            }

            // Frequency Envelope

            // Frequency from note number
            let freq = 440 * 2 ** ((note - 69) / 12);
            let freq_attack = (source[SourceParam.FreqAttack] / 9) ** 3;
            let freq_sustain = (source[SourceParam.FreqSustain] / 9) ** 3;
            let freq_release = (source[SourceParam.FreqRelease] / 6) ** 3;
            if (source[SourceParam.FreqEnabled]) {
                hfo.frequency.linearRampToValueAtTime(0, time);
                hfo.frequency.linearRampToValueAtTime(freq, time + freq_attack);
                hfo.frequency.setValueAtTime(freq, time + freq_attack + freq_sustain);
                hfo.frequency.exponentialRampToValueAtTime(
                    0.00001,
                    time + freq_attack + freq_sustain + freq_release
                );
            } else {
                hfo.frequency.setValueAtTime(freq, time);
            }

            hfo.start(time);
            hfo.stop(time + gain_duration);
        } else {
            let noise = audio.createBufferSource();
            noise.buffer = lazy_noise_buffer(audio);
            noise.loop = true;
            noise.connect(amp);

            noise.start(time);
            noise.stop(time + gain_duration);
        }

        if (gain_duration > total_duration) {
            total_duration = gain_duration;
        }
    }

    if (lfo) {
        lfo.start(time);
        lfo.stop(time + total_duration);
    }
}

let noise_buffer: AudioBuffer;
function lazy_noise_buffer(audio: AudioContext) {
    if (!noise_buffer) {
        noise_buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
        let channel = noise_buffer.getChannelData(0);
        for (var i = 0; i < channel.length; i++) {
            channel[i] = Math.random() * 2 - 1;
        }
    }
    return noise_buffer;
}
