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
        {name: 'U'},
        {name: 'M'},
        {name: 'S'}
    ];

    // Analyser
    var analyser, time;

    function updateAnalysers(canvasId, loop, normalize) {
        var i;

        // Fourier transform
        var fft = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(fft);

        // Remove noise
        if ($scope.vocals[0].data) {
            for (i = 0; i < fft.length; i++) {
                if ($scope.vocals[0].data[i] > fft[i]) {
                    fft[i] = 0;
                } else {
                    fft[i] -= $scope.vocals[0].data[i];
                }
            }
        }

        // Normalize
        var max = Math.max.apply(null, fft);

        if (normalize) {
            for (i = 0; i < fft.length; ++i) {
                fft[i] = fft[i] / max * 255;
            }
        }

        /*
        // Average value
        var mean = 0;

        for (i = 0; i < fft.length; i++) {
            mean += fft[i];
        }

        mean /= i;

        // Standard deviation
        var variance = 0;

        for (i = 0; i < fft.length; i++) {
            variance += Math.pow(fft[i] - mean, 2);
        }

        variance /= i;
        */

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

                for (j = 0; j < fft.length; ++j) {
                    vocal.error += Math.pow(fft[j] - vocal.data[j], 2);
                }

                //vocal.error = Math.round(vocal.error/(256*256*freqByteData.length)*100);

                log += vocal.name + ' (' + vocal.error + '), ';

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
            $scope.$apply(function () {
                best.active = true;
            });
        }

        // Draw signal
        var canvas = document.getElementById(canvasId);
        var ctx = canvas.getContext('2d');

        // Clear current frame
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#F6D565';
        ctx.lineCap = 'round';

        // Draw fft
        var mean;
        var bars = Math.floor(canvas.width/4);
        var inBars = Math.floor(fft.length/bars);

        for (i = 0; i < bars; i++) {
            mean = 0;

            for (j = 0; j < inBars; j++) {
               mean += fft[j + i*inBars];
            }

            mean /= inBars;

            ctx.fillStyle = 'hsl(' + Math.round((i*360)/bars) + ', 100%, 50%)';
            ctx.fillRect(i*(canvas.width/bars-1+1), canvas.height, canvas.width/bars-1, -mean/255*canvas.height);
        }

        if (loop !== false) {
            window.requestAnimationFrame(updateAnalysers.bind(this, canvasId));
        }

        return fft;
    }

    // Get audio stream
    media.getAudioSource().then(function (stream) {
        // Audio source
        var source = media.audioCtx.createMediaStreamSource(stream);

        // Analyser
        analyser = media.audioCtx.createAnalyser();
        analyser.fftsize = 2048;
        //analyser.smoothingTimeConstant = 0.95;
        source.connect(analyser);

        console.log('fftsize', analyser.fftsize);
        console.log('frequencyBinCount', analyser.frequencyBinCount);
        console.log('volume', analyser.minDecibels, 'to', analyser.maxDecibels, 'dBFS');

        updateAnalysers('analyser');

        // Index of vocal currently being recorded
        $scope.recordingIndex = -1;

        // Start recording vocals
        $interval(function () {
            // Get vocal to record
            var vocal = $scope.vocals[++$scope.recordingIndex];

            // Analyse recording
            if (vocal) {
                $timeout(function () {
                    vocal.data = updateAnalysers('vocal-' + vocal.name, false, $scope.recordingIndex !== 0);

                    /*
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
                    */
                }, 1000);
            }
        }, 2000, $scope.vocals.length + 1);
    }, function () {
        // Stream not available, go to setup
        $location.path('');
    });
});