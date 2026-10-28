/*
  SumanImg PWA file handling.
  Existing file-input handling remains the source of truth for decoding.
*/

if ("launchQueue" in window && "files" in LaunchParams.prototype) {
  launchQueue.setConsumer(async (launchParams) => {
    const fileInput = document.getElementById("fileInput");
    if (!fileInput || !launchParams.files?.length) return;

    try {
      const file = await launchParams.files[0].getFile();
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (error) {
      console.error("SumanImg file-handler launch failed:", error);
    }
  });
}
