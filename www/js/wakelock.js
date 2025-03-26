// USING WAKE LOCK API
// or fallback to nosleep.js


// NOSLEEP.JS
//
var noSleep = new NoSleep();


// USING WAKE LOCK API
//
function wakeLock() 
{
    if ('wakeLock' in navigator) {
    // create a reference for the wake lock
    let wakeLock = null;

    // create an async function to request a wake lock
    const requestWakeLock = async () => {
        try {
            wakeLock = await navigator.wakeLock.request('screen');

            // listen for our release event
            wakeLock.onrelease = function(ev) {
                // console.log(ev);
            }

            $("#wakeLock").text('OK');

        } catch (err) {
            // $("#wakeLock").text(`${err.name}, ${err.message}`);
            $("#wakeLock").text("NoSleep");
            console.log("Wake Lock error: ", err.name, err.message)
            console.log("Falling back to nosleep.js")

            document.removeEventListener('visibilitychange', handleVisibilityChange);
            noSleep.enable();
        }
    }

    const handleVisibilityChange = () => {
        if (wakeLock !== null && document.visibilityState === 'visible') {
            requestWakeLock();
        }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    requestWakeLock();
    }
    else {
        // $("#wakeLock").text("Wake Lock API not supported");
        $("#wakeLock").text("NoSleep");
        console.log("Wake Lock API not supported")
        console.log("Falling back to nosleep.js")
        noSleep.enable();
    }
}