

import React, { useState, useEffect, useRef } from 'react';
import {
  Mic, MicOff, User, Users, Copy, Trash2, Plus, Volume2, Wand2,
  SlidersHorizontal, Upload, FileUp, FileCode, Download, Radio, RotateCcw,
  Disc3, FileText, AlertTriangle, Terminal, Cpu, HardDrive, HelpCircle,
  ChevronUp, ChevronDown, ArrowUpDown, Sparkles, Keyboard, Feather,
  Pencil, X, Play, Undo, StickyNote, Save
} from 'lucide-react';

export default function App() {
  // --- Initial Data for the Vault ---
  const defaultScript = [
    { id: '1', type: 'scene', text: 'INT. RECORDING STUDIO - NIGHT' },
    { id: '2', type: 'action', text: 'A heavy brass dictaphone rests on the mahogany desk, softly illuminated by warm ambient light.' },
    { id: '3', type: 'character', text: 'LISA' },
    { id: '4', type: 'dialogue', text: 'Is this magnetic tape deck capturing every word of our manuscript?' },
    { id: '5', type: 'character', text: 'JOHN' },
    { id: '6', type: 'parenthetical', text: '(leaning close to the ribbon microphone)' },
    { id: '7', type: 'dialogue', text: 'Every word. Simply speak clearly into the receiver.' },
    { id: '8', type: 'note', text: 'Check if we need a Foley sound effect for the tape deck clicking on.' }
  ];

  const defaultCast = [
    { id: 'c1', name: 'LISA', pitchMin: 180, pitchMax: 280, sampleHz: 220, channel: '01', color: 'bg-amber-400' },
    { id: 'c2', name: 'JOHN', pitchMin: 85, pitchMax: 165, sampleHz: 125, channel: '02', color: 'bg-yellow-600' },
    { id: 'c3', name: 'NARRATOR', pitchMin: 140, pitchMax: 190, sampleHz: 160, channel: '03', color: 'bg-[#c5a059]' }
  ];

  // --- App State ---
  const [mode, setMode] = useState('keyword'); // 'keyword' (Solo) or 'cast' (Cast)
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showCheatSheet, setShowCheatSheet] = useState(true);
  const [isAutoCastMode, setIsAutoCastMode] = useState(true);

  // --- Vault (localStorage) State Initialization ---
  const [scriptItems, setScriptItems] = useState(() => {
    try {
      const saved = localStorage.getItem('dictaphone_script');
      return saved ? JSON.parse(saved) : defaultScript;
    } catch { return defaultScript; }
  });

  const [castProfiles, setCastProfiles] = useState(() => {
    try {
      const saved = localStorage.getItem('dictaphone_cast');
      return saved ? JSON.parse(saved) : defaultCast;
    } catch { return defaultCast; }
  });

  const [activeCharacter, setActiveCharacter] = useState(() => {
    try {
      const saved = localStorage.getItem('dictaphone_active_char');
      return saved || 'LISA';
    } catch { return 'LISA'; }
  });

  // Modal States
  const [modalState, setModalState] = useState({ type: null, isOpen: false }); 
  const [targetActor, setTargetActor] = useState(null);
  const [actorInput, setActorInput] = useState('');

  // Command Keywords
  const [keywords] = useState({
    changePrefix: 'change to',
    actionPrefix: 'action',
    scenePrefix: 'scene',
    parentheticalPrefix: 'feeling',
    notePrefix: 'note to self',
    undoCommands: ['scratch that', 'delete last', 'undo that']
  });

  // Acoustic & Speech State
  const [livePitch, setLivePitch] = useState(0);
  const [vuLevel, setVuLevel] = useState(0);
  const [matchedCastName, setMatchedCastName] = useState('');
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibratingCharId, setCalibratingCharId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Refs
  const recognitionRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const animFrameRef = useRef(null);
  const scriptEndRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const fileInputRef = useRef(null);
  const modalInputRef = useRef(null);

  // --- The Vault: Auto-Save to localStorage ---
  useEffect(() => {
    localStorage.setItem('dictaphone_script', JSON.stringify(scriptItems));
    localStorage.setItem('dictaphone_cast', JSON.stringify(castProfiles));
    localStorage.setItem('dictaphone_active_char', activeCharacter);
  }, [scriptItems, castProfiles, activeCharacter]);

  // --- Notification Toast ---
  const showToast = (msg, type = 'info') => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // --- Focus Modal Input Automatically ---
  useEffect(() => {
    if (modalState.isOpen && (modalState.type === 'add' || modalState.type === 'edit')) {
      setTimeout(() => modalInputRef.current?.focus(), 50);
    }
  }, [modalState]);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (modalState.isOpen) return; // Disable shortcuts when modal is open
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

      if (e.code === 'Space' || e.key.toLowerCase() === 'r') {
        e.preventDefault();
        toggleRecording();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const currentIndex = castProfiles.findIndex(p => p.name === activeCharacter);
        const nextIndex = (currentIndex + 1) % castProfiles.length;
        if (castProfiles[nextIndex]) {
          setActiveCharacter(castProfiles[nextIndex].name);
          showToast(`Active Speaker: ${castProfiles[nextIndex].name}`, 'info');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, activeCharacter, castProfiles, modalState]);

  // --- Timer ---
  useEffect(() => {
    if (isRecording) {
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerIntervalRef.current);
    }
    return () => clearInterval(timerIntervalRef.current);
  }, [isRecording]);

  const formatTapeTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
  };

  // --- Auto Scroll ---
  useEffect(() => {
    if (scriptEndRef.current) {
      scriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scriptItems, interimTranscript]);

  // --- Speech Recognition & Audio ---
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let currentInterim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const chunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            processDictatedSpeech(chunk.trim());
            setInterimTranscript('');
          } else {
            currentInterim += chunk;
            setInterimTranscript(currentInterim);
          }
        }
      };

      recognition.onerror = (err) => {
        if (err.error !== 'no-speech') {
          showToast(`Signal error: ${err.error}`, 'error');
        }
      };

      recognition.onend = () => {
        if (isRecording) {
          try { recognition.start(); } catch (e) {}
        }
      };

      recognitionRef.current = recognition;
    } else {
      showToast('Web Speech API is not supported on this browser.', 'error');
    }

    return () => {
      stopAudioProcessing();
    };
  }, [mode, castProfiles, activeCharacter, keywords, isRecording, isAutoCastMode, matchedCastName]);

  const startAudioProcessing = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.fftSize;
      const buffer = new Float32Array(bufferLength);

      const detectAudio = () => {
        analyser.getFloatTimeDomainData(buffer);
        
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i] * buffer[i];
        }
        const rms = Math.sqrt(sum / buffer.length);
        const level = Math.min(100, Math.round(rms * 450));
        setVuLevel(level);

        const pitch = autoCorrelate(buffer, audioCtx.sampleRate);
        if (pitch > 50 && pitch < 400) {
          setLivePitch(Math.round(pitch));

          if (mode === 'cast' && castProfiles.length > 0) {
            let closestChar = castProfiles[0];
            let minDiff = Math.abs(pitch - castProfiles[0].sampleHz);

            castProfiles.forEach((profile) => {
              const diff = Math.abs(pitch - profile.sampleHz);
              if (diff < minDiff) {
                minDiff = diff;
                closestChar = profile;
              }
            });

            setMatchedCastName(closestChar.name);
          }
        } else {
          setLivePitch(0);
        }

        animFrameRef.current = requestAnimationFrame(detectAudio);
      };

      detectAudio();
    } catch (err) {
      console.error('Microphone access failed:', err);
      showToast('Could not access microphone.', 'error');
    }
  };

  const stopAudioProcessing = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close();
    }
    setVuLevel(0);
    setLivePitch(0);
  };

  const autoCorrelate = (buffer, sampleRate) => {
    let SIZE = buffer.length;
    let sumOfSquares = 0;
    for (let i = 0; i < SIZE; i++) {
      let val = buffer[i];
      sumOfSquares += val * val;
    }
    let rms = Math.sqrt(sumOfSquares / SIZE);
    if (rms < 0.01) return -1;

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buffer[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    }

    buffer = buffer.slice(r1, r2);
    SIZE = buffer.length;

    let c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE - i; j++) {
        c[i] = c[i] + buffer[j] * buffer[j + i];
      }
    }

    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }
    let T0 = maxpos;

    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2;
    let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
  };

  // --- Toggle Dictation ---
  const toggleRecording = () => {
    if (isRecording) {
      if (recognitionRef.current) recognitionRef.current.stop();
      stopAudioProcessing();
      setIsRecording(false);
      showToast('Recording paused. Saved to Vault.', 'info');
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          startAudioProcessing();
          setIsRecording(true);
          showToast('Dictation active. Recording manuscript...', 'success');
        } catch (e) {
          showToast('Failed to start tape recording.', 'error');
        }
      }
    }
  };

  // --- Tape Rewind (Text to Speech) ---
  const playTapePlayback = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Stop anything currently playing
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.92; // Slightly slower
      utterance.pitch = 0.85; // Slightly deeper, simulating magnetic tape drag
      window.speechSynthesis.speak(utterance);
      showToast('Tape playback active...', 'info');
    } else {
      showToast('Playback not supported in this browser.', 'error');
    }
  };

  // --- Speech Parsing (The Brains) ---
  const processDictatedSpeech = (rawText) => {
    if (!rawText) return;
    const lower = rawText.toLowerCase().trim();

    // FEATURE 2: Scratch That (Undo) Command
    if (keywords.undoCommands.some(cmd => lower === cmd || lower.endsWith(cmd))) {
      setScriptItems(prev => {
        if (prev.length === 0) return prev;
        showToast('Erased previous line.', 'info');
        return prev.slice(0, -1);
      });
      return;
    }

    if (mode === 'keyword') {
      
      // FEATURE 5: Director's Notes Command
      if (lower.startsWith(keywords.notePrefix)) {
        const noteContent = rawText.substring(keywords.notePrefix.length).trim();
        addScriptElement('note', noteContent || 'Empty note.');
        return;
      }

      if (lower.startsWith(keywords.scenePrefix.toLowerCase())) {
        const sceneContent = rawText.substring(keywords.scenePrefix.length).trim().toUpperCase();
        addScriptElement('scene', sceneContent || 'INT. UNKNOWN LOCATION - DAY');
        return;
      }

      if (lower.startsWith(keywords.actionPrefix.toLowerCase())) {
        const actionContent = rawText.substring(keywords.actionPrefix.length).trim();
        addScriptElement('action', actionContent);
        return;
      }

      if (lower.startsWith(keywords.parentheticalPrefix.toLowerCase())) {
        const parentheticalText = rawText.substring(keywords.parentheticalPrefix.length).trim();
        addScriptElement('parenthetical', `(${parentheticalText})`);
        return;
      }

      if (lower.startsWith(keywords.changePrefix.toLowerCase())) {
        const charName = rawText.substring(keywords.changePrefix.length).trim().toUpperCase();
        setActiveCharacter(charName);
        showToast(`Speaker changed to ${charName}`, 'info');
        return;
      }

      const colonMatch = rawText.match(/^([a-zA-Z0-9_\s]+):\s*(.*)/);
      if (colonMatch) {
        const charName = colonMatch[1].trim().toUpperCase();
        const dialogue = colonMatch[2].trim();
        setActiveCharacter(charName);
        if (dialogue) appendDialogueToCharacter(charName, dialogue);
        return;
      }

      appendDialogueToCharacter(activeCharacter, rawText);
    } else if (mode === 'cast') {
      const speakerName = isAutoCastMode ? (matchedCastName || (castProfiles.length > 0 ? castProfiles[0].name : 'ACTOR')) : (activeCharacter || 'ACTOR');
      appendDialogueToCharacter(speakerName, rawText);
    }
  };

  const appendDialogueToCharacter = (charName, text) => {
    setScriptItems(prev => {
      const last = prev[prev.length - 1];
      if (last && last.type === 'character' && last.text === charName) {
        return [...prev, { id: Date.now().toString(), type: 'dialogue', text }];
      }
      if (last && last.type === 'dialogue' && prev.length >= 2 && prev[prev.length - 2].text === charName) {
        const updated = [...prev];
        updated[updated.length - 1].text += ' ' + text;
        return updated;
      }
      return [
        ...prev,
        { id: Date.now().toString() + '-c', type: 'character', text: charName },
        { id: Date.now().toString() + '-d', type: 'dialogue', text }
      ];
    });
  };

  const addScriptElement = (type, text) => {
    setScriptItems(prev => [...prev, { id: Date.now().toString(), type, text }]);
  };

  const updateScriptItem = (id, newText) => {
    setScriptItems(prev => prev.map(item => item.id === id ? { ...item, text: newText } : item));
  };

  const changeScriptItemType = (id, newType) => {
    setScriptItems(prev => prev.map(item => item.id === id ? { ...item, type: newType } : item));
  };

  const moveScriptItem = (index, direction) => {
    const newItems = [...scriptItems];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newItems.length) return;
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;
    setScriptItems(newItems);
  };

  const deleteScriptItem = (id) => {
    setScriptItems(prev => prev.filter(item => item.id !== id));
  };

  // --- Modal Controllers ---
  const closeModal = () => {
    setModalState({ type: null, isOpen: false });
    setActorInput('');
    setTargetActor(null);
  };

  const openClearModal = () => setModalState({ type: 'clear', isOpen: true });
  const openAddActorModal = () => {
    setActorInput('');
    setModalState({ type: 'add', isOpen: true });
  };
  const openEditActorModal = (actor) => {
    setTargetActor(actor);
    setActorInput(actor.name);
    setModalState({ type: 'edit', isOpen: true });
  };
  const openDeleteActorModal = (actor) => {
    setTargetActor(actor);
    setModalState({ type: 'delete', isOpen: true });
  };

  // --- Modal Confirm Actions ---
  const confirmClearScript = () => {
    setScriptItems([]);
    setRecordingSeconds(0);
    showToast('Manuscript cleared & Vault reset.', 'info');
    closeModal();
  };

  const confirmAddActor = () => {
    const newName = actorInput.trim().toUpperCase();
    if (!newName) return;
    
    const colors = ['bg-amber-400', 'bg-yellow-600', 'bg-[#c5a059]', 'bg-amber-700', 'bg-emerald-600', 'bg-red-700'];
    const color = colors[castProfiles.length % colors.length];
    const channelNum = (castProfiles.length + 1).toString().padStart(2, '0');
    
    setCastProfiles(prev => [...prev, {
      id: Date.now().toString(),
      name: newName,
      pitchMin: 120,
      pitchMax: 220,
      sampleHz: 160,
      channel: channelNum,
      color: color
    }]);
    
    if (!isAutoCastMode || mode === 'keyword') {
      setActiveCharacter(newName);
    }
    
    showToast(`Added character: ${newName}`, 'success');
    closeModal();
  };

  const confirmEditActor = () => {
    const newName = actorInput.trim().toUpperCase();
    if (!newName || !targetActor) return;
    
    setCastProfiles(prev => prev.map(p => p.id === targetActor.id ? { ...p, name: newName } : p));
    
    if (activeCharacter === targetActor.name) {
      setActiveCharacter(newName);
    }
    showToast(`Character updated to: ${newName}`, 'success');
    closeModal();
  };

  const confirmDeleteActor = () => {
    if (!targetActor) return;
    
    const updatedProfiles = castProfiles.filter(p => p.id !== targetActor.id);
    setCastProfiles(updatedProfiles);
    
    if (activeCharacter === targetActor.name) {
      setActiveCharacter(updatedProfiles.length > 0 ? updatedProfiles[0].name : 'ACTOR');
    }
    showToast(`Deleted character: ${targetActor.name}`, 'info');
    closeModal();
  };

  // --- Script File Import Parser ---
  const handleScriptFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      parseAndLoadScript(e.target.result, file.name);
    };
    reader.readAsText(file);
  };

  const parseAndLoadScript = (rawContent, filename = '') => {
    if (!rawContent || !rawContent.trim()) {
      showToast('Uploaded script file is empty.', 'error');
      return;
    }

    const lines = rawContent.split(/\r?\n/);
    const parsedElements = [];
    const discoveredCharacters = new Set();

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Basic note detection for import (if prefixed manually)
      if (trimmed.toLowerCase().startsWith('note:')) {
         parsedElements.push({ id: `imp-${index}`, type: 'note', text: trimmed.substring(5).trim() });
      } else if (trimmed.match(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i)) {
        parsedElements.push({ id: `imp-${index}`, type: 'scene', text: trimmed.toUpperCase() });
      } else if (
        trimmed === trimmed.toUpperCase() &&
        trimmed.length > 1 &&
        trimmed.length < 35 &&
        !trimmed.endsWith('.') &&
        !trimmed.endsWith('?') &&
        !trimmed.endsWith('!')
      ) {
        const charName = trimmed.replace(/\(V\.O\.\)|\(O\.S\.\)/g, '').trim();
        discoveredCharacters.add(charName);
        parsedElements.push({ id: `imp-${index}`, type: 'character', text: charName });
      } else if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
        parsedElements.push({ id: `imp-${index}`, type: 'parenthetical', text: trimmed });
      } else {
        const lastEl = parsedElements[parsedElements.length - 1];
        if (lastEl && (lastEl.type === 'character' || lastEl.type === 'parenthetical' || lastEl.type === 'dialogue')) {
          parsedElements.push({ id: `imp-${index}`, type: 'dialogue', text: trimmed });
        } else {
          parsedElements.push({ id: `imp-${index}`, type: 'action', text: trimmed });
        }
      }
    });

    if (parsedElements.length > 0) {
      setScriptItems(parsedElements);

      const newProfiles = Array.from(discoveredCharacters).map((charName, i) => {
        const colors = ['bg-amber-400', 'bg-yellow-600', 'bg-[#c5a059]', 'bg-amber-700'];
        const existing = castProfiles.find(p => p.name === charName);
        return existing || {
          id: `c-imp-${i}`,
          name: charName,
          pitchMin: 100 + (i * 30),
          pitchMax: 200 + (i * 30),
          sampleHz: 140 + (i * 25),
          channel: (i + 1).toString().padStart(2, '0'),
          color: colors[i % colors.length]
        };
      });

      if (newProfiles.length > 0) {
        setCastProfiles(newProfiles);
        setActiveCharacter(newProfiles[0].name);
      }

      showToast(`Imported ${parsedElements.length} lines. Saved to Vault.`, 'success');
    } else {
      showToast('Unrecognized screenplay format.', 'error');
    }
  };

  const loadDemoScript = () => {
    setScriptItems(defaultScript);
    setCastProfiles(defaultCast);
    showToast('Demo loaded. Vault overwritten.', 'success');
  };

  const calibrateVoiceProfile = (profileId) => {
    setIsCalibrating(true);
    setCalibratingCharId(profileId);
    let pitchSamples = [];

    const AudioCtx = window.window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();
    analyserRef.current = audioCtx.createAnalyser();

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      micStreamRef.current = stream;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      const buffer = new Float32Array(2048);
      const interval = setInterval(() => {
        analyserRef.current.getFloatTimeDomainData(buffer);
        const pitch = autoCorrelate(buffer, audioCtx.sampleRate);
        if (pitch > 60 && pitch < 380) {
          pitchSamples.push(pitch);
        }
      }, 50);

      setTimeout(() => {
        clearInterval(interval);
        stream.getTracks().forEach(t => t.stop());
        audioCtx.close();

        if (pitchSamples.length > 0) {
          const avgPitch = Math.round(pitchSamples.reduce((a, b) => a + b, 0) / pitchSamples.length);
          setCastProfiles(prev => prev.map(p => p.id === profileId ? { ...p, sampleHz: avgPitch, pitchMin: avgPitch - 40, pitchMax: avgPitch + 40 } : p));
          showToast(`Voice Pitch Calibrated: ${avgPitch} Hz`, 'success');
        } else {
          showToast('Could not sample voice clearly.', 'error');
        }
        setIsCalibrating(false);
        setCalibratingCharId(null);
      }, 3000);
    });
  };

  const copyScriptToClipboard = () => {
    const formattedText = scriptItems.map(item => {
      if (item.type === 'character') return `\n\n\t\t\t\t${item.text.toUpperCase()}`;
      if (item.type === 'parenthetical') return `\t\t\t${item.text}`;
      if (item.type === 'dialogue') return `\t\t${item.text}`;
      if (item.type === 'scene') return `\n\n${item.text.toUpperCase()}`;
      if (item.type === 'note') return `\n[[ NOTE: ${item.text} ]]`;
      return `\n${item.text}`;
    }).join('');

    navigator.clipboard.writeText(formattedText);
    showToast('Manuscript copied to clipboard!', 'success');
  };

  const downloadScriptText = () => {
    const content = scriptItems.map(item => `${item.type.toUpperCase()}: ${item.text}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'screenplay_manuscript.txt';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded manuscript file.', 'success');
  };

  // Determine current effective speaker for display purposes
  let displaySpeaker = activeCharacter;
  if (mode === 'cast' && isAutoCastMode) {
      displaySpeaker = matchedCastName || (castProfiles.length > 0 ? castProfiles[0].name : 'ACTOR');
  }

  return (
    <div className="min-h-screen bg-[#120f0d] text-[#e8ded1] font-serif p-3 sm:p-6 flex flex-col items-center selection:bg-[#c5a059] selection:text-black pb-36">
      
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleScriptFileUpload}
        accept=".txt,.fountain,.script,.fdx"
        className="hidden"
      />

      {/* Classy Toast Alert */}
      {toastMessage && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-5 py-3 border border-[#d4af37]/40 shadow-[0_10px_25px_rgba(0,0,0,0.8)] font-sans text-xs tracking-wider uppercase font-semibold backdrop-blur-md transition-all ${
          toastMessage.type === 'error' ? 'bg-[#2b1010]/95 border-red-500/50 text-red-200' :
          toastMessage.type === 'success' ? 'bg-[#122616]/95 border-emerald-500/50 text-emerald-200' :
          'bg-[#1e1914]/95 border-[#c5a059]/60 text-[#f5ea8c]'
        }`}>
          <Feather className="w-4 h-4 text-[#d4af37]" />
          <span>{toastMessage.msg}</span>
        </div>
      )}

      {/* --- CUSTOM MODALS OVERLAY --- */}
      {modalState.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0807]/90 backdrop-blur-sm p-4 font-sans animate-in fade-in duration-200">
          <div className="bg-[#1c1713] border border-[#d4af37]/60 p-6 max-w-sm w-full shadow-[0_20px_60px_rgba(0,0,0,0.9)] relative space-y-4">
            <button onClick={closeModal} className="absolute top-4 right-4 text-[#8a7662] hover:text-[#d4af37] transition">
              <X className="w-5 h-5" />
            </button>

            {modalState.type === 'add' && (
              <>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-[#d4af37] flex items-center gap-2">
                  <User className="w-4 h-4" /> Add Character
                </h3>
                <p className="text-xs text-[#a89580] font-serif italic">Enter the character's name to create a new voice track.</p>
                <input
                  ref={modalInputRef}
                  type="text"
                  value={actorInput}
                  onChange={(e) => setActorInput(e.target.value.toUpperCase())}
                  placeholder="e.g. NARRATOR"
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmAddActor(); }}
                  className="w-full bg-[#0a0807] border border-[#3d3127] p-3 text-sm font-mono font-bold text-[#e5c158] uppercase focus:border-[#d4af37] focus:outline-none shadow-inner"
                />
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={closeModal} className="px-4 py-2 text-xs font-semibold text-[#8a7662] hover:text-[#e8ded1] uppercase tracking-wider">Cancel</button>
                  <button onClick={confirmAddActor} className="px-5 py-2 text-xs font-bold bg-gradient-to-r from-[#c5a059] to-[#a8823b] text-black uppercase tracking-wider shadow-md hover:brightness-110">Create Track</button>
                </div>
              </>
            )}

            {modalState.type === 'edit' && (
              <>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-[#d4af37] flex items-center gap-2">
                  <Pencil className="w-4 h-4" /> Edit Character
                </h3>
                <p className="text-xs text-[#a89580] font-serif italic">Rename the existing character track.</p>
                <input
                  ref={modalInputRef}
                  type="text"
                  value={actorInput}
                  onChange={(e) => setActorInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmEditActor(); }}
                  className="w-full bg-[#0a0807] border border-[#3d3127] p-3 text-sm font-mono font-bold text-[#e5c158] uppercase focus:border-[#d4af37] focus:outline-none shadow-inner"
                />
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={closeModal} className="px-4 py-2 text-xs font-semibold text-[#8a7662] hover:text-[#e8ded1] uppercase tracking-wider">Cancel</button>
                  <button onClick={confirmEditActor} className="px-5 py-2 text-xs font-bold bg-gradient-to-r from-[#c5a059] to-[#a8823b] text-black uppercase tracking-wider shadow-md hover:brightness-110">Save Changes</button>
                </div>
              </>
            )}

            {modalState.type === 'delete' && (
              <>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-red-500 flex items-center gap-2">
                  <Trash2 className="w-4 h-4" /> Delete Character?
                </h3>
                <p className="text-sm text-[#e8ded1]">Are you sure you want to delete <span className="font-bold text-[#d4af37] font-mono">{targetActor?.name}</span>'s voice track?</p>
                <p className="text-xs text-[#a89580] font-serif italic">This will not erase their previously dictated script lines, but their profile will be removed from the channel tracks.</p>
                <div className="flex justify-end gap-3 pt-4">
                  <button onClick={closeModal} className="px-4 py-2 text-xs font-semibold text-[#8a7662] hover:text-[#e8ded1] uppercase tracking-wider">Cancel</button>
                  <button onClick={confirmDeleteActor} className="px-5 py-2 text-xs font-bold bg-red-800 hover:bg-red-700 text-white uppercase tracking-wider shadow-md">Delete Track</button>
                </div>
              </>
            )}

            {modalState.type === 'clear' && (
              <>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-red-500 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Clear Manuscript?
                </h3>
                <p className="text-sm text-[#e8ded1]">Are you sure you want to completely erase the current script manuscript?</p>
                <p className="text-xs text-[#a89580] font-serif italic">This action is permanent and resets the dictation tape.</p>
                <div className="flex justify-end gap-3 pt-4">
                  <button onClick={closeModal} className="px-4 py-2 text-xs font-semibold text-[#8a7662] hover:text-[#e8ded1] uppercase tracking-wider">Cancel</button>
                  <button onClick={confirmClearScript} className="px-5 py-2 text-xs font-bold bg-red-800 hover:bg-red-700 text-white uppercase tracking-wider shadow-md">Clear All</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* CLASSY MAHOGANY & BRASS CHASSIS */}
      <div className="w-full max-w-7xl bg-[#1a1512] border-4 border-[#2d241e] shadow-[0_25px_60px_rgba(0,0,0,0.95)] p-4 sm:p-6 relative">
        
        {/* Polished Brass Corner Accents */}
        <div className="absolute top-2 left-2 w-2.5 h-2.5 bg-[#c5a059] rounded-full border border-black shadow-inner" />
        <div className="absolute top-2 right-2 w-2.5 h-2.5 bg-[#c5a059] rounded-full border border-black shadow-inner" />
        <div className="absolute bottom-2 left-2 w-2.5 h-2.5 bg-[#c5a059] rounded-full border border-black shadow-inner" />
        <div className="absolute bottom-2 right-2 w-2.5 h-2.5 bg-[#c5a059] rounded-full border border-black shadow-inner" />

        {/* TOP CONSOLE CHAMPAGNE GOLD / STEEL PANEL */}
        <div className="bg-gradient-to-b from-[#2a221b] to-[#1c1713] border-2 border-[#3d3127] p-5 mb-6 relative overflow-hidden shadow-inner">
          
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6 relative z-10">
            
            {/* Title & Emblem */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-[#c5a059] to-[#8a6d33] border border-[#f0d8a8]/40 flex items-center justify-center shadow-lg shrink-0">
                <Radio className="w-6 h-6 text-[#120f0d]" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-serif font-normal tracking-[0.2em] text-[#f2e6d8] uppercase drop-shadow flex items-center gap-3">
                  DICTAPHONE <span className="text-[#d4af37] font-semibold">TR-1978</span>
                  <div className="flex items-center gap-1 text-[8px] tracking-widest text-[#6eb872] bg-[#122616] px-2 py-0.5 border border-[#264f28] rounded-full" title="Saved to Local Storage">
                    <Save className="w-2.5 h-2.5" />
                    VAULT ACTIVE
                  </div>
                </h1>
                <p className="text-[10px] font-sans text-[#a89580] tracking-[0.25em] uppercase font-medium mt-0.5">
                  Automated Multi-Track Voice Screenwriter
                </p>
              </div>
            </div>

            {/* CASSETTE TAPE DISPLAY */}
            <div className="bg-[#0f0c0a] border-2 border-[#3d3127] p-3 px-6 flex items-center gap-6 shadow-[inset_0_2px_12px_rgba(0,0,0,0.9)]">
              <div className="flex flex-col items-center">
                <div className={`w-12 h-12 rounded-full border-2 border-[#47392e] bg-[#1a1410] flex items-center justify-center shadow-md ${isRecording ? 'animate-spin' : ''}`} style={{ animationDuration: '4s' }}>
                  <Disc3 className="w-8 h-8 text-[#c5a059]/80" />
                </div>
                <span className="text-[8px] font-sans text-[#7a6a5a] mt-1 font-semibold tracking-wider">FEED</span>
              </div>

              {/* Tape Digital Counter */}
              <div className="flex flex-col items-center px-3 border-x border-[#2d241e]">
                <span className="text-[9px] font-sans uppercase tracking-[0.2em] text-[#b8a38d] font-semibold mb-1">
                  COUNTER
                </span>
                <div className="bg-[#050403] border border-[#d4af37]/40 px-3 py-1 text-[#e5c158] font-mono text-xl font-medium tracking-widest shadow-[inset_0_0_8px_rgba(212,175,55,0.2)]">
                  {formatTapeTime(recordingSeconds)}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-amber-400 animate-ping' : 'bg-[#3d3127]'}`} />
                  <span className="text-[9px] font-sans font-semibold text-[#d4af37] tracking-widest uppercase">
                    {isRecording ? 'RECORDING' : 'PAUSED'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-center">
                <div className={`w-12 h-12 rounded-full border-2 border-[#47392e] bg-[#1a1410] flex items-center justify-center shadow-md ${isRecording ? 'animate-spin' : ''}`} style={{ animationDuration: '4s' }}>
                  <Disc3 className="w-8 h-8 text-[#c5a059]/80" />
                </div>
                <span className="text-[8px] font-sans text-[#7a6a5a] mt-1 font-semibold tracking-wider">TAKE-UP</span>
              </div>
            </div>

            {/* DUAL ANALOG VU METERS */}
            <div className="flex gap-3">
              <div className="w-28 h-20 bg-[#f7f0dd] border border-[#2d241e] p-1.5 flex flex-col justify-between shadow-inner relative overflow-hidden">
                <div className="flex justify-between text-[7px] font-sans font-bold text-[#3d2f23]">
                  <span>-20</span>
                  <span>-10</span>
                  <span>-5</span>
                  <span>0</span>
                  <span className="text-amber-800">+3</span>
                </div>
                <div className="w-full border-b border-[#3d2f23]/40 my-1 relative">
                  <div className="absolute right-0 top-0 w-3 border-b-2 border-amber-800" />
                </div>
                <div
                  className="w-0.5 bg-black h-12 origin-bottom transition-transform duration-75 ease-out absolute bottom-1 left-1/2"
                  style={{ transform: `rotate(${Math.min(45, Math.max(-45, (vuLevel * 0.9) - 45))}deg)` }}
                />
                <div className="text-[8px] font-sans font-bold text-center text-[#3d2f23] uppercase tracking-wider">VU METER</div>
              </div>

              <div className="w-28 h-20 bg-[#070605] border border-[#d4af37]/30 p-2 flex flex-col justify-between shadow-[inset_0_0_8px_rgba(212,175,55,0.15)] font-mono">
                <div className="text-[8px] font-sans text-[#c5a059] font-medium tracking-widest uppercase">
                  FREQUENCY
                </div>
                <div className="text-lg font-bold text-[#e5c158] tracking-widest text-center">
                  {livePitch > 0 ? `${livePitch}Hz` : '000Hz'}
                </div>
                <div className="text-[8px] font-sans text-[#a89580] text-center font-semibold uppercase truncate">
                  {displaySpeaker}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* MAIN WORKSPACE GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT 5 COLS: CONTROLS & CHANNELS */}
          <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-6 font-sans">

            {/* MODE SWITCHER PANEL */}
            <div className="bg-[#14100e] border border-[#3d3127] p-4 shadow-md">
              <div className="text-[11px] font-semibold text-[#c5a059] uppercase tracking-[0.15em] mb-3 flex items-center justify-between">
                <span>Dictation Mode</span>
                <button
                  onClick={() => setShowCheatSheet(!showCheatSheet)}
                  className="text-[10px] text-[#e5c158] flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  {showCheatSheet ? 'Hide Help' : 'Commands'}
                </button>
              </div>

              <div className="bg-[#0a0807] p-1 border border-[#2d241e] flex gap-1.5">
                <button
                  onClick={() => setMode('keyword')}
                  className={`flex-1 py-2 px-2 text-xs font-semibold uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    mode === 'keyword'
                      ? 'bg-gradient-to-r from-[#c5a059] to-[#a8823b] text-black shadow font-bold'
                      : 'text-[#8a7662] hover:text-[#e8ded1]'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  Solo Trigger
                </button>

                <button
                  onClick={() => setMode('cast')}
                  className={`flex-1 py-2 px-2 text-xs font-semibold uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    mode === 'cast'
                      ? 'bg-gradient-to-r from-[#c5a059] to-[#a8823b] text-black shadow font-bold'
                      : 'text-[#8a7662] hover:text-[#e8ded1]'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Cast Match
                </button>
              </div>

              {/* Enhanced Cheat Sheet */}
              {showCheatSheet && (
                <div className="mt-3 text-[11px] bg-[#070605] p-3 border border-[#3d3127] space-y-2.5 font-mono text-[#c8b9a6]">
                  <div>
                    <div className="text-[#d4af37] font-semibold uppercase border-b border-[#2d241e] pb-1 mb-1.5 text-[10px] tracking-wider">
                      Voice Triggers:
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                      <div><span className="text-[#e5c158]">"Change [Name]"</span></div>
                      <div>Switch Speaker</div>
                      <div><span className="text-[#e5c158]">"Scene [Header]"</span></div>
                      <div>Scene Heading</div>
                      <div><span className="text-[#e5c158]">"Action [Text]"</span></div>
                      <div>Action Block</div>
                      <div><span className="text-[#e5c158]">"Feeling [Text]"</span></div>
                      <div>Parenthetical</div>
                    </div>
                  </div>

                  <div className="border-t border-[#2d241e] pt-1.5">
                    <div className="text-[#d4af37] font-semibold uppercase pb-1 text-[10px] tracking-wider">
                      Power Commands:
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                      <div><span className="text-red-400">"Scratch that"</span></div>
                      <div>Undo last line</div>
                      <div><span className="text-[#89a7b1]">"Note to self..."</span></div>
                      <div>Insert Dir. Note</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* CHANNEL STRIP ACTOR TRACKS */}
            <div className="bg-[#14100e] border border-[#3d3127] p-4 shadow-md space-y-3">
              <div className="flex items-center justify-between border-b border-[#2d241e] pb-2">
                <div className="text-[11px] font-semibold text-[#c5a059] uppercase tracking-[0.15em] flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5 text-[#d4af37]" />
                  Channel Tracks
                </div>
                <button
                  onClick={openAddActorModal}
                  className="text-[10px] text-[#e5c158] hover:underline uppercase font-semibold cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Actor
                </button>
              </div>

              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {castProfiles.map((p) => {
                  const isSelected = (!isAutoCastMode || mode === 'keyword') && activeCharacter === p.name;
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setActiveCharacter(p.name);
                        setIsAutoCastMode(false);
                      }}
                      className={`p-2.5 border transition cursor-pointer font-sans flex items-center justify-between group ${
                        isSelected
                          ? 'bg-[#221b16] border-[#d4af37]'
                          : 'bg-[#0a0807] border-[#221b16] hover:border-[#3d3127]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] font-mono text-[#7a6a5a] font-bold hidden sm:inline">CH-{p.channel}</span>
                        <div className={`w-2 h-2 rounded-full ${p.color}`} />
                        <div>
                          <span className="text-xs font-semibold text-[#e8ded1] uppercase tracking-wider">{p.name}</span>
                          {mode === 'cast' && <span className="text-[9px] text-[#8a7662] block font-mono">{p.sampleHz} Hz Target</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                        {mode === 'cast' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); calibrateVoiceProfile(p.id); }}
                            disabled={isCalibrating}
                            title="Sample Voice Pitch"
                            className="p-1.5 bg-[#14100e] hover:bg-[#221b16] text-[#c8b9a6] border border-[#3d3127] rounded cursor-pointer flex items-center justify-center"
                          >
                            <Volume2 className="w-3.5 h-3.5 text-[#d4af37]" />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditActorModal(p); }}
                          title="Edit Character Name"
                          className="p-1.5 bg-[#14100e] hover:bg-[#221b16] text-[#c8b9a6] border border-[#3d3127] rounded cursor-pointer flex items-center justify-center"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openDeleteActorModal(p); }}
                          title="Delete Track"
                          className="p-1.5 bg-[#2b1010] hover:bg-[#3b1212] text-red-300 border border-red-900/50 rounded cursor-pointer flex items-center justify-center"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* UTILITY ACTIONS */}
            <div className="bg-[#14100e] border border-[#3d3127] p-4 shadow-md space-y-2">
              <div className="text-[11px] font-semibold text-[#c5a059] uppercase tracking-[0.15em] mb-2">
                Actions
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="py-2.5 px-3 bg-[#182219] hover:bg-[#202f22] border border-[#2e4730] text-[#a1e6a6] font-semibold text-xs flex items-center justify-center gap-2 shadow uppercase tracking-wider cursor-pointer transition"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import Manuscript
                </button>
              </div>
            </div>

          </div>

          {/* RIGHT 7 COLS: MANUSCRIPT PAPER */}
          <div className="lg:col-span-7 flex flex-col space-y-3">
            
            {/* FAST CHARACTER SELECTOR BAR */}
            <div className="bg-[#14100e] border border-[#3d3127] p-2.5 flex items-center gap-3 overflow-x-auto font-sans">
              <span className="text-[10px] font-semibold text-[#c5a059] uppercase tracking-wider whitespace-nowrap flex items-center gap-1 shrink-0">
                <span>Active Speaker:</span>
              </span>
              <div className="flex items-center gap-1.5 w-full">
                {mode === 'cast' && (
                  <button
                    onClick={() => setIsAutoCastMode(true)}
                    className={`px-3 py-1 text-xs font-semibold uppercase tracking-wider transition whitespace-nowrap border cursor-pointer shrink-0 flex items-center gap-1 ${
                      isAutoCastMode
                        ? 'bg-gradient-to-r from-emerald-600 to-emerald-800 text-white border-emerald-400 font-bold shadow'
                        : 'bg-[#1c1713] text-[#c8b9a6] border-[#3d3127] hover:border-emerald-500 hover:text-emerald-300'
                    }`}
                    title="Automatically detect speaker via pitch"
                  >
                    <Wand2 className="w-3 h-3" /> AUTO
                  </button>
                )}
                
                {mode === 'cast' && <div className="w-px h-4 bg-[#3d3127] mx-1 shrink-0" />}

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                  {castProfiles.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setActiveCharacter(p.name);
                        if (mode === 'cast') setIsAutoCastMode(false);
                      }}
                      className={`px-3 py-1 text-xs font-semibold uppercase tracking-wider transition whitespace-nowrap border cursor-pointer ${
                        (!isAutoCastMode || mode === 'keyword') && activeCharacter === p.name
                          ? 'bg-gradient-to-r from-[#c5a059] to-[#a8823b] text-black border-[#d4af37] font-bold shadow'
                          : 'bg-[#1c1713] text-[#c8b9a6] border-[#3d3127] hover:border-[#c5a059]'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* MAIN MANUSCRIPT VIEWPORT */}
            <div className="bg-[#f7f3e8] border-2 border-[#3d3127] shadow-2xl flex-1 flex flex-col overflow-hidden text-[#1a1410] relative min-h-[620px]">
              
              {/* Paper Header Bar */}
              <div className="bg-[#ebd8c0] border-b border-[#cca985] px-6 py-2.5 flex items-center justify-between text-xs text-[#4a3a2a] font-sans font-semibold uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#8a5d2b]" />
                  <span>Manuscript Feed</span>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={loadDemoScript} className="hover:text-black transition cursor-pointer" title="Load demo">
                    Demo
                  </button>
                  <button onClick={openClearModal} className="text-red-800 hover:text-red-950 transition cursor-pointer flex items-center gap-1" title="Clear script">
                    <RotateCcw className="w-3 h-3" /> Clear
                  </button>
                  <button onClick={downloadScriptText} className="hover:text-black transition cursor-pointer" title="Download">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Typewriter Body Viewport */}
              <div className="flex-1 p-8 sm:p-12 overflow-y-auto space-y-4 font-mono text-xs sm:text-sm leading-relaxed max-h-[720px] tracking-tight relative">
                {scriptItems.length === 0 ? (
                  <div className="h-80 flex flex-col items-center justify-center text-[#8a7662] italic font-serif">
                    <Feather className="w-8 h-8 mb-2 opacity-40 text-[#4a3a2a]" />
                    <p className="font-semibold text-base">Manuscript Ready</p>
                    <p className="text-xs mt-1 font-sans not-italic">Press Spacebar or click Record to dictate lines.</p>
                  </div>
                ) : (
                  scriptItems.map((item, index) => (
                    <div key={item.id} className="group relative border-l-2 border-transparent hover:border-[#c5a059] pl-2 transition">
                      
                      {/* Note Block (New Feature) */}
                      {item.type === 'note' && (
                        <div className="my-4 p-3 bg-amber-100/50 border-l-4 border-amber-500/60 rounded text-[#8a5d2b] font-sans text-xs italic shadow-sm relative mr-8 sm:mr-16">
                          <div className="flex gap-2 items-start">
                            <StickyNote className="w-4 h-4 mt-0.5 shrink-0 opacity-70" />
                            <textarea
                              value={item.text}
                              onChange={(e) => updateScriptItem(item.id, e.target.value)}
                              rows={1}
                              className="w-full bg-transparent focus:bg-amber-100 px-1 rounded focus:outline-none resize-none"
                            />
                          </div>
                        </div>
                      )}

                      {/* Scene Heading */}
                      {item.type === 'scene' && (
                        <div className="mt-6 mb-2 font-bold uppercase text-[#1a1410] tracking-widest border-b border-[#cca985]/60 pb-1">
                          <input
                            type="text"
                            value={item.text}
                            onChange={(e) => updateScriptItem(item.id, e.target.value.toUpperCase())}
                            className="w-full bg-transparent focus:bg-[#ebd8c0]/60 px-1 rounded focus:outline-none font-bold"
                          />
                        </div>
                      )}

                      {/* Action Block */}
                      {item.type === 'action' && (
                        <div className="my-2 text-[#2c221a]">
                          <textarea
                            value={item.text}
                            onChange={(e) => updateScriptItem(item.id, e.target.value)}
                            rows={1}
                            className="w-full bg-transparent focus:bg-[#ebd8c0]/60 px-1 rounded focus:outline-none resize-none"
                          />
                        </div>
                      )}

                      {/* Character Name (Centered) */}
                      {item.type === 'character' && (
                        <div className="mt-4 mb-0 text-center font-bold text-[#1a1410] uppercase tracking-widest sm:px-24">
                          <input
                            type="text"
                            value={item.text}
                            onChange={(e) => updateScriptItem(item.id, e.target.value.toUpperCase())}
                            className="w-full text-center bg-transparent focus:bg-[#ebd8c0]/60 px-1 rounded focus:outline-none font-bold"
                          />
                        </div>
                      )}

                      {/* Parenthetical (Centered) */}
                      {item.type === 'parenthetical' && (
                        <div className="text-center italic text-[#5c4a38] text-xs sm:px-28">
                          <input
                            type="text"
                            value={item.text}
                            onChange={(e) => updateScriptItem(item.id, e.target.value)}
                            className="w-full text-center bg-transparent focus:bg-[#ebd8c0]/60 px-1 rounded focus:outline-none"
                          />
                        </div>
                      )}

                      {/* Dialogue Block */}
                      {item.type === 'dialogue' && (
                        <div className="text-center text-[#1a1410] sm:px-16 font-medium">
                          <textarea
                            value={item.text}
                            onChange={(e) => updateScriptItem(item.id, e.target.value)}
                            rows={2}
                            className="w-full text-center bg-transparent focus:bg-[#ebd8c0]/60 px-1 rounded focus:outline-none resize-y"
                          />
                        </div>
                      )}

                      {/* Hover Controls (Added Tape Rewind Play Button) */}
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-[#ebd8c0] border border-[#cca985] px-1.5 py-0.5 rounded shadow font-sans">
                        <button onClick={() => playTapePlayback(item.text)} className="text-blue-800 hover:text-blue-950 p-0.5 cursor-pointer border-r border-[#cca985] pr-1 mr-1" title="Play line audio">
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        <select
                          value={item.type}
                          onChange={(e) => changeScriptItemType(item.id, e.target.value)}
                          className="bg-transparent text-[10px] font-semibold text-[#1a1410] focus:outline-none uppercase cursor-pointer"
                        >
                          <option value="scene">Scene</option>
                          <option value="action">Action</option>
                          <option value="character">Char</option>
                          <option value="parenthetical">Feel</option>
                          <option value="dialogue">Dialogue</option>
                          <option value="note">Note</option>
                        </select>
                        <button onClick={() => moveScriptItem(index, -1)} className="hover:text-black text-[#5c4a38] p-0.5 cursor-pointer" title="Move up">
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => moveScriptItem(index, 1)} className="hover:text-black text-[#5c4a38] p-0.5 cursor-pointer" title="Move down">
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteScriptItem(item.id)} className="text-red-800 hover:text-red-950 p-0.5 cursor-pointer" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
                
                {/* Interim Live Stream */}
                {interimTranscript && (
                  <div className="p-2.5 bg-[#e8d5bf] border-l-4 border-[#c5a059] italic text-[#2c221a] animate-pulse text-xs font-mono">
                    "{interimTranscript}..."
                  </div>
                )}

                <div ref={scriptEndRef} />
              </div>

              {/* Typewriter Bottom Ribbon */}
              <div className="bg-[#ebd8c0] p-3 border-t border-[#cca985] flex items-center justify-center gap-2 font-sans text-xs uppercase font-semibold">
                <button
                  onClick={() => addScriptElement('scene', 'INT. NEW SCENE - DAY')}
                  className="px-3 py-1 bg-[#dfcca2] hover:bg-[#cca985] text-[#1a1410] border border-[#b89570] transition cursor-pointer"
                >
                  + Scene
                </button>
                <button
                  onClick={() => addScriptElement('action', 'Enter action details...')}
                  className="px-3 py-1 bg-[#dfcca2] hover:bg-[#cca985] text-[#1a1410] border border-[#b89570] transition cursor-pointer"
                >
                  + Action
                </button>
                <button
                  onClick={() => addScriptElement('character', displaySpeaker)}
                  className="px-3 py-1 bg-[#dfcca2] hover:bg-[#cca985] text-[#1a1410] border border-[#b89570] transition cursor-pointer"
                >
                  + Character
                </button>
                <button
                  onClick={() => addScriptElement('note', 'New note...')}
                  className="px-3 py-1 bg-[#dfcca2] hover:bg-[#cca985] text-[#8a5d2b] border border-[#b89570] transition cursor-pointer"
                >
                  + Note
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* STICKY BOTTOM TAPE CONTROL BAR */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#120f0d] border-t-2 border-[#c5a059]/60 p-3 shadow-[0_-10px_30px_rgba(0,0,0,0.95)] font-sans">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 px-2 sm:px-6">
          
          {/* Status Light & Active Speaker Display */}
          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${isRecording ? 'bg-amber-400 animate-ping' : 'bg-[#3d3127]'}`} />
              <span className="text-xs font-semibold tracking-widest uppercase text-[#e8ded1]">
                {isRecording ? 'RECORDING LIVE' : 'STANDBY'}
              </span>
            </div>

            <div className="text-xs bg-[#0a0807] px-3 py-1 border border-[#3d3127] text-[#d4af37] font-semibold flex items-center gap-1.5">
              <span className="text-[10px] text-[#8a7662]">SPEAKER:</span>
              <span>{displaySpeaker}</span>
            </div>
          </div>

          {/* MAIN RECORD BUTTON */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            
            {/* Quick Undo Shortcut button */}
            <button
              onClick={() => {
                 setScriptItems(prev => {
                    if (prev.length === 0) return prev;
                    showToast('Erased previous line.', 'info');
                    return prev.slice(0, -1);
                 });
              }}
              className="p-3 bg-[#221b16] hover:bg-[#2e241e] border border-[#3d3127] text-red-400 font-semibold text-xs shadow hidden lg:flex items-center gap-1.5 cursor-pointer transition"
              title="Undo last line"
            >
              <Undo className="w-4 h-4" />
            </button>

            <button
              onClick={toggleRecording}
              className={`w-full sm:w-96 py-3 px-6 text-xs sm:text-sm font-semibold flex items-center justify-center gap-3 border uppercase tracking-widest shadow-lg transition-all cursor-pointer ${
                isRecording
                  ? 'bg-gradient-to-r from-red-800 to-amber-900 border-red-500 text-white animate-pulse'
                  : 'bg-gradient-to-r from-[#d4af37] via-[#e5c158] to-[#c5a059] border-[#f0d8a8] text-black font-bold'
              }`}
            >
              <div className={`w-3.5 h-3.5 rounded-full ${isRecording ? 'bg-white' : 'bg-black'}`} />
              <span>{isRecording ? 'STOP / PAUSE' : 'START RECORDING'}</span>
              <span className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded font-normal hidden md:inline">SPACE</span>
            </button>

            {/* Quick Copy Shortcut */}
            <button
              onClick={copyScriptToClipboard}
              className="p-3 bg-[#221b16] hover:bg-[#2e241e] border border-[#3d3127] text-[#d4af37] font-semibold text-xs shadow hidden lg:flex items-center gap-1.5 cursor-pointer transition"
              title="Copy Manuscript"
            >
              <Copy className="w-4 h-4" />
              <span>COPY</span>
            </button>
          </div>

        </div>
      </div>

    </div>
  );
}