import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardTitle } from '../components/Card';
import { ClipboardDocumentListIcon, LightBulbIcon } from '@heroicons/react/24/outline';
import { healthAssistant } from '../utils/api';

const VOICE_RESTART_DELAY_MS = 900;

const SymptomChecker = () => {
  const [symptoms, setSymptoms] = useState('');
  const [results, setResults] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const [chat, setChat] = useState([]);
  const [error, setError] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognitionRef = useRef(null);
  const conversationModeRef = useRef(false);
  const isListeningRef = useRef(false);
  const isAssistantTypingRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const restartTimerRef = useRef(null);
  const handleUserMessageRef = useRef(null);

  useEffect(() => {
    conversationModeRef.current = conversationMode;
  }, [conversationMode]);

  useEffect(() => {
    isAssistantTypingRef.current = isAssistantTyping;
  }, [isAssistantTyping]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  const getVoiceSupportError = useCallback(() => {
    if (typeof window === 'undefined') return 'Voice recognition is unavailable in this environment.';

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return 'Voice recognition is not supported in this browser. Use Chrome/Edge.';

    const hostname = window.location?.hostname || '';
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (!window.isSecureContext && !isLocalhost) {
      return 'Voice recognition requires HTTPS (or localhost in development).';
    }
    return '';
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    clearRestartTimer();
    try {
      if (recognitionRef.current && isListeningRef.current) {
        recognitionRef.current.stop();
      }
    } catch (_) {}
    isListeningRef.current = false;
    setIsListening(false);
  }, [clearRestartTimer]);

  const startListening = useCallback(() => {
    clearRestartTimer();
    setError('');

    const supportError = getVoiceSupportError();
    if (supportError) {
      setError(supportError);
      return;
    }

    if (!recognitionRef.current || isListeningRef.current) return;

    try {
      recognitionRef.current.start();
    } catch (e) {
      if (e?.name !== 'InvalidStateError') {
        setError('Could not start voice recognition. Check microphone permission.');
      }
    }
  }, [clearRestartTimer, getVoiceSupportError]);

  const scheduleListeningRestart = useCallback(() => {
    clearRestartTimer();
    if (!conversationModeRef.current) return;
    if (isAssistantTypingRef.current || isSpeakingRef.current) return;
    restartTimerRef.current = setTimeout(() => {
      startListening();
    }, VOICE_RESTART_DELAY_MS);
  }, [clearRestartTimer, startListening]);

  const speak = useCallback(
    (message, langHint) =>
      new Promise((resolve) => {
        if (typeof window === 'undefined' || !window.speechSynthesis || !message) {
          resolve();
          return;
        }

        try {
          window.speechSynthesis.cancel();
          setIsSpeaking(true);

          const utter = new SpeechSynthesisUtterance(message);
          if (selectedVoice) {
            utter.voice = selectedVoice;
          } else if (langHint && langHint.startsWith('hi')) {
            utter.lang = 'hi-IN';
          }
          utter.rate = 0.95;
          utter.pitch = 1.0;

          utter.onend = () => {
            setIsSpeaking(false);
            resolve();
          };

          utter.onerror = () => {
            setIsSpeaking(false);
            resolve();
          };

          window.speechSynthesis.speak(utter);
        } catch (_) {
          setIsSpeaking(false);
          resolve();
        }
      }),
    [selectedVoice]
  );

  const handleUserMessage = useCallback(
    async (message) => {
      const trimmedMessage = String(message || '').trim();
      if (!trimmedMessage) return;

      setError('');
      const language = /[\u0900-\u097F]/.test(trimmedMessage) ? 'hi' : 'en';

      setChat((currentChat) => [...currentChat, { role: 'user', text: trimmedMessage }]);
      setIsAssistantTyping(true);

      if (conversationModeRef.current) {
        stopListening();
      }

      try {
        const { reply } = await healthAssistant({ message: trimmedMessage, language });
        const assistantText = reply || "I'm here to help. Please describe your symptoms.";
        setChat((currentChat) => [...currentChat, { role: 'assistant', text: assistantText }]);
        await speak(assistantText, language);
      } catch (e) {
        const fallbackMessage =
          e?.message ||
          "I'm sorry, I'm having trouble right now. Please try again or consult a doctor.";
        setChat((currentChat) => [...currentChat, { role: 'assistant', text: fallbackMessage }]);
        await speak(fallbackMessage, 'en');
      } finally {
        setIsAssistantTyping(false);
        if (conversationModeRef.current) {
          scheduleListeningRestart();
        }
      }
    },
    [scheduleListeningRestart, speak, stopListening]
  );

  useEffect(() => {
    handleUserMessageRef.current = handleUserMessage;
  }, [handleUserMessage]);

  useEffect(() => {
    if (typeof window === 'undefined') return () => {};

    const synth = window.speechSynthesis;
    const loadVoices = () => {
      const availableVoices = synth.getVoices();
      const defaultVoice =
        availableVoices.find((voice) => voice.lang.startsWith('en') && voice.name.toLowerCase().includes('female')) ||
        availableVoices.find((voice) => voice.lang.startsWith('en')) ||
        availableVoices[0] ||
        null;
      setSelectedVoice(defaultVoice);
    };

    loadVoices();
    if (synth?.addEventListener) {
      synth.addEventListener('voiceschanged', loadVoices);
    } else if (synth) {
      synth.onvoiceschanged = loadVoices;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const recognizer = new SR();
      recognizer.lang = 'en-US';
      recognizer.continuous = false;
      recognizer.interimResults = true;

      recognizer.onstart = () => {
        isListeningRef.current = true;
        setIsListening(true);
      };

      recognizer.onresult = (event) => {
        let finalTranscript = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const segment = event.results[index][0]?.transcript || '';
          if (event.results[index].isFinal) {
            finalTranscript += `${segment} `;
          }
        }

        const transcript = finalTranscript.trim();
        if (!transcript) return;
        setSymptoms(transcript);

        if (conversationModeRef.current && handleUserMessageRef.current) {
          handleUserMessageRef.current(transcript);
        }
      };

      recognizer.onend = () => {
        isListeningRef.current = false;
        setIsListening(false);
        if (conversationModeRef.current) {
          scheduleListeningRestart();
        }
      };

      recognizer.onerror = (event) => {
        isListeningRef.current = false;
        setIsListening(false);

        if (event.error === 'aborted') return;

        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setError('Microphone permission denied. Allow microphone access and try again.');
          return;
        }
        if (event.error === 'network') {
          setError('Speech recognition network error. Please retry.');
          return;
        }
        setError('Voice recognition failed. Please try again.');
      };

      recognitionRef.current = recognizer;
    }

    return () => {
      clearRestartTimer();
      try {
        if (recognitionRef.current) recognitionRef.current.stop();
      } catch (_) {}
      recognitionRef.current = null;
      isListeningRef.current = false;
      if (synth) {
        synth.cancel();
        if (synth?.removeEventListener) {
          synth.removeEventListener('voiceschanged', loadVoices);
        } else if (synth.onvoiceschanged === loadVoices) {
          synth.onvoiceschanged = null;
        }
      }
    };
  }, [clearRestartTimer, scheduleListeningRestart]);

  const toggleConversationMode = async () => {
    if (conversationModeRef.current) {
      conversationModeRef.current = false;
      setConversationMode(false);
      stopListening();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      await speak('Voice conversation ended. You can still type your questions below.', 'en');
      return;
    }

    const supportError = getVoiceSupportError();
    if (supportError) {
      setError(supportError);
      return;
    }

    conversationModeRef.current = true;
    setConversationMode(true);
    setResults(null);
    setChat([]);
    await speak("Starting voice conversation. Tell me about your symptoms and I'll help guide you.", 'en');
    scheduleListeningRestart();
  };

  const sendSymptomsToAssistant = () => {
    const message = symptoms.trim();
    if (!message) return;
    setSymptoms('');
    handleUserMessage(message);
  };

  const checkSymptoms = async () => {
    const message = symptoms.trim();
    if (!message) return;

    try {
      const { reply } = await healthAssistant({ message, language: 'en' });
      const summary = reply || 'Rest and stay hydrated';
      setResults({
        possibleConditions: ['Please consult a doctor for proper diagnosis'],
        recommendations: [summary, 'Monitor your temperature', 'Consult a doctor if symptoms worsen'],
        severity: 'Please see a healthcare professional'
      });
    } catch (_) {
      setResults({
        possibleConditions: ['Unable to analyze - please consult a doctor'],
        recommendations: ['Rest and stay hydrated', 'Monitor your temperature', 'Consult a doctor if symptoms worsen'],
        severity: 'Unknown - see doctor'
      });
    }
  };

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">Symptom Checker</h1>
          <p className="text-xl text-gray-600">
            Get preliminary insights about your symptoms. Always consult a doctor for accurate diagnosis.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center mb-6">
                  <ClipboardDocumentListIcon className="h-8 w-8 text-primary-500 mr-3" />
                  <CardTitle>Describe Your Symptoms</CardTitle>
                </div>

                <div className="mb-6 text-center">
                  <button
                    onClick={toggleConversationMode}
                    className={`px-6 py-3 text-lg font-semibold rounded-full transition-all duration-300 ${
                      conversationMode ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'
                    }`}
                  >
                    {conversationMode ? 'Stop Voice Chat' : 'Start Voice Chat'}
                  </button>
                  <p className="mt-2 text-sm text-gray-600">
                    {conversationMode ? "Speak naturally and I'll respond" : 'Click to talk with me about your health'}
                  </p>
                </div>

                <div className="mb-6 text-center">
                  <button
                    onClick={isListening ? stopListening : startListening}
                    disabled={conversationMode || isAssistantTyping}
                    className={`px-6 py-3 text-lg font-semibold rounded-lg transition-all duration-300 ${
                      isListening ? 'bg-green-500 hover:bg-green-600 text-white animate-pulse' : 'bg-purple-500 hover:bg-purple-600 text-white'
                    } ${conversationMode || isAssistantTyping ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {isListening ? 'Stop Listening' : 'Listen Once'}
                  </button>
                  <p className="mt-1 text-xs text-gray-500">Listen for one message</p>
                </div>

                <textarea
                  value={symptoms}
                  onChange={(event) => setSymptoms(event.target.value)}
                  placeholder="Describe how you're feeling, when it started, and any other relevant details..."
                  className="w-full h-40 p-4 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                  <button
                    onClick={checkSymptoms}
                    disabled={!symptoms.trim() || isAssistantTyping}
                    className={`py-3 px-4 rounded-lg font-semibold ${
                      symptoms.trim() && !isAssistantTyping
                        ? 'bg-primary-500 text-white hover:bg-primary-600'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    Analyze Symptoms
                  </button>
                  <button
                    onClick={sendSymptomsToAssistant}
                    disabled={!symptoms.trim() || isAssistantTyping}
                    className={`py-3 px-4 rounded-lg font-semibold ${
                      symptoms.trim() && !isAssistantTyping
                        ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    Send To Assistant
                  </button>
                </div>

                {(chat.length > 0 || isAssistantTyping) && (
                  <div className="mt-4 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                    {chat.map((msg, idx) => (
                      <div
                        key={`${msg.role}-${idx}`}
                        className={`rounded-md px-3 py-2 text-sm ${
                          msg.role === 'user' ? 'bg-blue-50 text-blue-900' : 'bg-gray-50 text-gray-800'
                        }`}
                      >
                        <span className="font-semibold mr-2">{msg.role === 'user' ? 'You:' : 'Assistant:'}</span>
                        <span>{msg.text}</span>
                      </div>
                    ))}
                    {isAssistantTyping && <p className="text-xs text-gray-500 px-1">Assistant is typing...</p>}
                  </div>
                )}

                {error && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-800 font-medium">Warning: {error}</p>
                  </div>
                )}

                <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
                  <div className="flex items-start">
                    <LightBulbIcon className="h-5 w-5 text-yellow-500 mt-0.5 mr-3" />
                    <div>
                      <h4 className="font-semibold text-yellow-800">Important Note</h4>
                      <p className="text-yellow-700 text-sm">
                        This tool provides preliminary information only. Always consult a healthcare professional for proper diagnosis and treatment.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            {results ? (
              <Card>
                <CardContent className="p-6">
                  <CardTitle className="mb-6">Analysis Results</CardTitle>

                  <div className="space-y-6">
                    <div>
                      <h4 className="font-semibold text-gray-800 mb-2">Severity Level:</h4>
                      <div className="px-3 py-2 rounded-lg text-white text-center bg-red-500">{results.severity}</div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-800 mb-2">Possible Conditions:</h4>
                      <ul className="list-disc list-inside space-y-1 text-gray-700">
                        {results.possibleConditions.map((condition, index) => (
                          <li key={index}>{condition}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-800 mb-2">Recommendations:</h4>
                      <ul className="list-disc list-inside space-y-1 text-gray-700">
                        {results.recommendations.map((recommendation, index) => (
                          <li key={index}>{recommendation}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h4 className="font-semibold text-blue-800 mb-2">Next Steps:</h4>
                      <p className="text-blue-700">
                        Consider scheduling a consultation with a doctor for proper diagnosis and treatment plan.
                      </p>
                      <button className="mt-3 bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600">
                        Find a Doctor
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6 text-center">
                  <div className="text-gray-400 mb-4">
                    <ClipboardDocumentListIcon className="h-12 w-12 mx-auto" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">No Analysis Yet</h3>
                  <p className="text-gray-500">
                    Describe your symptoms on the left to get started with the analysis.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SymptomChecker;
