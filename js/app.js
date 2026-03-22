const baseUrl =
  window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8787"
    : "https://api.whalebox.moe";

document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("fileInput");
  const dropzone = document.getElementById("dropzone");
  const status = document.getElementById("status");
  const dropzoneMessage = dropzone.querySelector(".dz-message");

  function createFileBox(file) {
    const box = document.createElement("div");
    box.className = "file-box";

    const info = document.createElement("div");
    info.className = "file-info";
    info.textContent = `${file.name} - ${Math.round(file.size / 1024)} KB`;

    const progress = document.createElement("div");
    progress.className = "progress";
    const bar = document.createElement("div");
    bar.className = "progress-bar";
    bar.style.width = "0%";
    progress.appendChild(bar);

    const actions = document.createElement("div");
    actions.className = "file-actions";

    const linkA = document.createElement("a");
    linkA.href = "#";
    linkA.target = "_blank";
    linkA.style.wordBreak = "break-all";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "copy-btn";
    copyBtn.textContent = "Copy link";
    copyBtn.style.display = "none";

    actions.appendChild(linkA);
    actions.appendChild(copyBtn);

    box.appendChild(info);
    box.appendChild(progress);
    box.appendChild(actions);

    dropzone.appendChild(box);

    return { box, info, bar, linkA, copyBtn };
  }

  function isCheckboxChecked(checkboxId) {
    const checkbox = document.getElementById(checkboxId);
    return checkbox ? checkbox.checked : false;
  }

  async function fetchJSON(request) {
    try {
      const response = await fetch(request);
      if (response.status == 401) {
        return [null, `Please log in first (${response.status})`];
      } else if (response.status == 404 || response.status == 500) {
        return [
          null,
          `Something went wrong, please try again (${response.status})`,
        ];
      }
      if (!response.ok) {
        return [null, "server is being stupih and didnt send smth back"];
      }
      return [await response.json(), null];
    } catch (error) {
      console.error("Error:", error);
    }
  }

  async function initUpload(file) {
    const request = new Request(`${baseUrl}/upload/init`, {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        filesize: file.size,
        overwrite: isCheckboxChecked("overwrite"),
        gameStorage: isCheckboxChecked("gameStorage"),
      }),
      credentials: "include",
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    });

    const [response, err] = await fetchJSON(request);
    if (err) return [null, err];
    return [response, null];
  }

  async function completeUpload(uploadId, parts = null) {
    const request = new Request(`${baseUrl}/upload/complete`, {
      method: "POST",
      body: JSON.stringify({ uploadId, ...(parts && { parts }) }),
      credentials: "include",
      headers: { "Content-type": "application/json; charset=UTF-8" },
    });
    const err = await fetchJSON(request);
    if (err) return err;
    return null;
  }

  async function uploadFile(file) {
    const { box, info, bar, linkA, copyBtn } = createFileBox(file);

    const [data, err] = await initUpload(file);

    if (err || !data) {
      info.textContent = `${file.name} - Upload failed (${err}).`;
      status.textContent = `Upload failed (${err}).`;
      dropzoneMessage.textContent = "Drop or select files";
      return;
    }

    const uploadId = data.uploadId;
    const downloadUrl = data.downloadUrl;

    if (data.multipart) {
      const PART_SIZE = 100 * 1024 * 1024;
      const parts = [];

      for (const part of data.parts) {
        const start = (part.partNumber - 1) * PART_SIZE;
        const chunk = file.slice(start, Math.min(start + PART_SIZE, file.size));

        const res = await fetch(part.url, { method: "PUT", body: chunk });
        if (!res.ok) {
          info.textContent = `${file.name} - Upload failed (part ${part.partNumber}).`;
          return;
        }

        parts.push({
          partNumber: part.partNumber,
          etag: res.headers.get("ETag"),
        });

        const pct = Math.round((part.partNumber / data.parts.length) * 100);
        bar.style.width = pct + "%";
        info.textContent = `${file.name} - ${pct}%`;
        dropzoneMessage.textContent = `Uploading ${pct}%`;
      }

      const err = await completeUpload(uploadId, parts);
      if (err) {
        info.textContent = `${file.name} - Upload failed (${err}).`;
        return;
      }

      linkA.textContent = downloadUrl;
      linkA.href = downloadUrl;
      copyBtn.style.display = "inline-block";
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(downloadUrl);
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = "Copy link";
          }, 2000);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = downloadUrl;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = "Copy link";
          }, 2000);
        }
      });
      info.textContent = `${file.name} - Done`;
      bar.style.width = "100%";
      status.textContent = "Upload successful.";
      dropzoneMessage.textContent = "Drop or select files";
      return;
    }

    const uploadUrl = data.uploadUrl;
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        bar.style.width = pct + "%";
        info.textContent = `${file.name} - ${pct}%`;
        dropzoneMessage.textContent = `Uploading ${pct}%`;
      };

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.responseText);
          const err = await completeUpload(uploadId);
          if (err) {
            reject(`Upload failed (${err}).`);
            info.textContent = `${file.name} - Upload failed (${err}).`;
            console.error("Upload error", err);
            status.textContent = `Upload failed (${err}).`;
            return;
          }

          linkA.textContent = downloadUrl;
          linkA.href = downloadUrl;
          copyBtn.style.display = "inline-block";
          copyBtn.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(downloadUrl);
              copyBtn.textContent = "Copied!";
              setTimeout(() => {
                copyBtn.textContent = "Copy link";
              }, 2000);
            } catch (err) {
              const ta = document.createElement("textarea");
              ta.value = downloadUrl;
              document.body.appendChild(ta);
              ta.select();
              try {
                document.execCommand("copy");
                copyBtn.textContent = "Copied!";
              } catch (e) {
                alert("Copy failed");
              }
              ta.remove();
              setTimeout(() => {
                copyBtn.textContent = "Copy link";
              }, 2000);
            }
          });
          info.textContent = `${file.name} - Done`;
          bar.style.width = "100%";
          status.textContent = "Upload successful.";
        } else {
          reject(`Upload failed (${xhr.status}).`);
          info.textContent = `${file.name} - Upload failed (${xhr.status}).`;
          console.error("Upload error", xhr.responseText);
          status.textContent = `Upload failed (${xhr.status}).`;
        }
        dropzoneMessage.textContent = "Drop or select files";
      };

      xhr.onerror = () => {
        reject(`Upload failed (${xhr.status}).`);
        info.textContent = `${file.name} - Upload failed (network error).`;
        status.textContent = "Upload failed (network error).";
        dropzoneMessage.textContent = "Drop or select files";
      };

      xhr.send(file);
    });
  }

  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(";").shift();
  }

  const roCopier = getCookie("rocopier") === "true";
  const admin = getCookie("admin") === "true";
  let checkboxCenter = null;

  if (roCopier) {
    checkboxCenter = document.createElement("div");
    checkboxCenter.className = "checkbox-center";
    const gameStorageCheckbox = document.createElement("input");
    const gameStorageLabel = document.createElement("label");

    gameStorageCheckbox.type = "checkbox";
    gameStorageCheckbox.id = "gameStorage";

    gameStorageLabel.htmlFor = "gameStorage";
    gameStorageLabel.textContent = "Add to game storage (Ro-Copier)";

    checkboxCenter.appendChild(gameStorageCheckbox);
    checkboxCenter.appendChild(gameStorageLabel);

    document.body.appendChild(checkboxCenter);
  }

  if (admin) {
    if (!checkboxCenter) {
      checkboxCenter = document.createElement("div");
      checkboxCenter.className = "checkbox-center";
    }
    const overwriteCheckbox = document.createElement("input");
    const overwriteLabel = document.createElement("label");

    overwriteCheckbox.type = "checkbox";
    overwriteCheckbox.id = "overwrite";

    overwriteLabel.htmlFor = "overwrite";
    overwriteLabel.textContent = "Overwrite existing files";

    checkboxCenter.appendChild(overwriteCheckbox);
    checkboxCenter.appendChild(overwriteLabel);

    document.body.appendChild(checkboxCenter);
  }

  dropzone.addEventListener("click", (e) => {
    if (
      e.target.closest(".file-box") ||
      e.target.classList.contains("copy-btn")
    )
      return;
    fileInput.click();
  });

  fileInput.addEventListener("change", (e) => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;
    files.forEach((f) => uploadFile(f));
    fileInput.value = "";
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.style.backgroundColor = "#9fb0e6";
  });
  dropzone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dropzone.style.backgroundColor = "";
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.style.backgroundColor = "";
    const dt = e.dataTransfer;
    if (!dt || !dt.files || dt.files.length === 0) return;
    const files = Array.from(dt.files);

    try {
      const dataTransfer = new DataTransfer();
      for (const f of files) dataTransfer.items.add(f);
      fileInput.files = dataTransfer.files;
    } catch (err) {}
    files.forEach((f) => uploadFile(f));
  });
});
