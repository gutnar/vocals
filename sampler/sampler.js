// Application
var app = angular.module('vocals.sampler', ['ngRoute', 'ngAnimate']);

// Initialize
app.config(function ($routeProvider) {
    $routeProvider
        .when('/', {
            controller: 'SetupCtrl',
            templateUrl: 'setup.html'
        })
        .when('/record', {
            controller: 'RecordCtrl',
            templateUrl: 'record.html'
        });
});

/**
 * Media service
 */

app.service('media', function ($q) {
    var media = {};

    // APIs
    if (!navigator.getUserMedia) {
        navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    }

    if (!navigator.cancelAnimationFrame) {
        navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame || navigator.mozCancelAnimationFrame;
    }

    if (!navigator.requestAnimationFrame) {
        navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestAnimationFrame;
    }

    // Audio context
    media.audioCtx = new AudioContext();

    // Get audio stream
    media.getAudioSource = function () {
        // Create promise
        return $q(function (resolve, reject) {
            // Stream already available
            if (media.stream) {
                resolve(media.stream);
                return;
            }

            // Request media
            navigator.getUserMedia({
                audio: {
                    mandatory: {
                        googNoiseSuppression: 'true'
                    }
                }
            }, function (stream) {
                // Save stream
                media.stream = stream;
                resolve(stream);
            }, reject);
        });
    };

    return media;
});

/**
 * Microphone setup
 */

app.controller('SetupCtrl', function (media, $scope, $location) {
    // Request web audio stream
    media.getAudioSource().then(function (stream) {
        $scope.start = function () {
            $location.path('record');
        };
    }, function (error) {
        console.warn(error);
    });
});

app.controller('RecordCtrl', function (media, $scope, $location, $interval, $timeout) {
    // Vocals
    $scope.vocals = [
        {name: 'müra'},
        {name: 'A'},
        {name: 'E'},
        {name: 'I'},
        {name: 'O'},
        {name: 'U'}
    ];

    // Analyser
    var analyser;

    function updateAnalysers(canvasId, loop) {
        var canvas = document.getElementById(canvasId);
        var canvasWidth = canvas.width;
        var canvasHeight = canvas.height;
        var analyserContext = canvas.getContext('2d');

        // analyzer draw code here
        var SPACING = 3;
        var BAR_WIDTH = 1;
        var numBars = Math.round(canvasWidth / SPACING);

        var freqByteData = new Uint8Array(analyser.frequencyBinCount);

        analyser.getByteFrequencyData(freqByteData);

        // Normalize
        var i, max = Math.max.apply(null, freqByteData);

        for (i = 0; i < freqByteData.length; ++i) {
            freqByteData[i] = freqByteData[i] / max * 255;
        }

        // Average value
        var mean = 0;

        for (i = 0; i < freqByteData.length; i++) {
            mean += freqByteData[i];
        }

        mean /= i;

        // Standard deviation
        var variance = 0;

        for (i = 0; i < freqByteData.length; i++) {
            variance += Math.pow(freqByteData[i] - mean, 2);
        }

        variance /= i;

        // Compare
        var j, vocal, log = '', best;

        for (i = 0; i < $scope.vocals.length; ++i) {
            vocal = $scope.vocals[i];
            vocal.active = false;

            if (vocal.data) {
                /*
                vocal.correlation = 0;
                for (j = 0; j < vocal.data.length; j++){
                    vocal.correlation += (vocal.data[j] - vocal.mean)*(freqByteData[j]-mean);
                }
                vocal.correlation /= vocal.variance*variance*j;
                vocal.correlation = Math.round(vocal.correlation*100);
                */

                vocal.error = 0;

                for (j = 0; j < freqByteData.length; ++j) {
                    vocal.error += Math.pow(freqByteData[j] - vocal.data[j], 2);
                }

                //vocal.error = Math.round(vocal.error/(256*256*freqByteData.length)*100);

                log += vocal.name + ' (' + vocal.correlation + '), ';

                if (!best || vocal.error < best.error) {
                    best = vocal;
                }
            }
        }

        for (i = 0; i < $scope.vocals.length; ++i) {
            vocal = $scope.vocals[i];
            if (best && best.error && vocal.error) {
                vocal.match = Math.round(best.error / vocal.error * 100);
            }
        }

        if (log) {
            console.log(log + best.name);

            $scope.$apply(function () {
                best.active = true;
            });
        }

        analyserContext.clearRect(0, 0, canvasWidth, canvasHeight);
        analyserContext.fillStyle = '#F6D565';
        analyserContext.lineCap = 'round';
        var multiplier = analyser.frequencyBinCount / numBars;

        // Draw rectangle for each frequency bin.
        for (i = 0; i < numBars; ++i) {
            var magnitude = 0;
            var offset = Math.floor( i * multiplier );
            // gotta sum/average the block, or we miss narrow-bandwidth spikes
            for (j = 0; j< multiplier; j++)
                magnitude += freqByteData[offset + j];
            magnitude = magnitude / multiplier * canvasHeight / 255;
            var magnitude2 = freqByteData[i * multiplier];
            analyserContext.fillStyle = "hsl( " + Math.round((i*360)/numBars) + ", 100%, 50%)";
            analyserContext.fillRect(i * SPACING, canvasHeight, BAR_WIDTH, -magnitude);
        }

        if (loop !== false) {
            window.requestAnimationFrame(updateAnalysers.bind(this, canvasId));
        }

        return freqByteData;
    }

    // Get audio stream
    media.getAudioSource().then(function (stream) {
        // Audio source
        var source = media.audioCtx.createMediaStreamSource(stream);

        // Analyser
        analyser = media.audioCtx.createAnalyser();
        analyser.fftsize = 2048;
        source.connect(analyser);

        updateAnalysers('analyser');

        // Index of vocal currently being recorded
        $scope.recordingIndex = -1;

        $interval(function () {
            for (var i = 0; i < $scope.vocals.length; ++i) {
                $scope.vocals[i].showError = $scope.vocals[i].error;
            }
        }, 250);

        // Start recording vocals
        $interval(function () {
            // Get vocal to record
            var vocal = $scope.vocals[++$scope.recordingIndex];

            // Analyse recording
            if (vocal) {
                $timeout(function () {
                    vocal.data = updateAnalysers('vocal-' + vocal.name, false);

                    // Average value
                    vocal.mean = 0;

                    for (var i = 0; i < vocal.data.length; i++) {
                        vocal.mean += vocal.data[i];
                    }

                    vocal.mean /= i;

                    // Standard deviation
                    vocal.variance = 0;

                    for (var j = 0; j < vocal.data.length; j++) {
                        vocal.variance += Math.pow(vocal.data[j] - vocal.mean, 2);
                    }

                    vocal.variance /= j;
                }, 1000);
            }
        }, 2000, $scope.vocals.length + 1);
    }, function () {
        // Stream not available, go to setup
        $location.path('');
    });
});