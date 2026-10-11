const installButton = document.querySelector("#install-app");
let installPrompt;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!installPrompt) {
    return;
  }

  installButton.disabled = true;
  try {
    await installPrompt.prompt();
    await installPrompt.userChoice;
  } catch (error) {
    console.error("Knoledge Search could not complete the app installation prompt:", error);
  } finally {
    installPrompt = null;
    installButton.hidden = true;
    installButton.disabled = false;
  }
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  installButton.hidden = true;
});

if (
  ["http:", "https:"].includes(window.location.protocol) &&
  "serviceWorker" in navigator &&
  window.isSecureContext
) {
  const updateDialog = document.querySelector("#app-update-dialog");
  const updateNowButton = document.querySelector("#app-update-now");
  const updateLaterButton = document.querySelector("#app-update-later");
  let waitingWorker;
  let reloadForUpdate = false;
  let updateNotificationShown = false;

  function notifyUpdateAvailable(worker) {
    if (!navigator.serviceWorker.controller || updateNotificationShown) {
      return;
    }
    updateNotificationShown = true;
    waitingWorker = worker;
    updateDialog.showModal();
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadForUpdate) {
      window.location.reload();
    }
  });

  navigator.serviceWorker
    .register("./sw.js", { updateViaCache: "none" })
    .then((registration) => {
      function watchForUpdate(worker) {
        if (!worker) {
          return;
        }

        const showWhenInstalled = () => {
          if (worker.state === "installed") {
            notifyUpdateAvailable(worker);
          }
        };
        worker.addEventListener("statechange", showWhenInstalled);
        showWhenInstalled();
      }

      if (registration.waiting) {
        notifyUpdateAvailable(registration.waiting);
      }
      registration.addEventListener("updatefound", () => {
        watchForUpdate(registration.installing);
      });

      const checkForUpdates = () => {
        registration.update().catch((error) => {
          console.error("Knoledge Search could not check for web app updates:", error);
        });
      };
      checkForUpdates();
      window.setInterval(checkForUpdates, 60 * 60 * 1000);
    })
    .catch((error) => {
      console.error("Knoledge Search offline support could not be enabled:", error);
    });

  updateNowButton.addEventListener("click", () => {
    if (!waitingWorker) {
      console.error("Knoledge Search could not apply the available update: no waiting worker was found.");
      updateDialog.close();
      return;
    }
    reloadForUpdate = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    updateDialog.close();
  });

  updateLaterButton.addEventListener("click", () => {
    updateDialog.close();
  });
}
