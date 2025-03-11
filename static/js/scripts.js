document.addEventListener('DOMContentLoaded', function() {
  // ----------------- Global Variables -----------------
  // Selected annotation class from the list
  let selectedAnnotationClass = null;
  // Start and end times for the current annotation in seconds
  let startTime = 0;
  let endTime = 0;
  // Currently active marker (start, end, or current)
  let activeMarker = null;
  // The currently selected video file
  let currentVideo = null;
  // Mode indicating if the video is unfinished or finished (default is "unfinished")
  let currentVideoMode = "unfinished";

  // Default frames per second used for calculating frame numbers
  const defaultFps = 30;
  // Reference to the video player element
  const videoPlayer = document.getElementById('video-player');
  // Reference to the custom timebar element for displaying markers
  const customTimebar = document.getElementById('custom-timebar');
  // References to individual markers on the timebar
  const currentMarker = document.getElementById('current-marker');
  const startMarker = document.getElementById('start-marker');
  const endMarker = document.getElementById('end-marker');
  // Display element showing the current video time and duration
  const currentSecondDisplay = document.getElementById('current-second-display');
  // Play/Pause button element
  const playPauseBtn = document.getElementById('play-pause-btn');
  // List element containing annotation classes
  const classesList = document.getElementById('classes-list');
  // Overlay element shown during processing (e.g., extraction)
  const progressOverlay = document.getElementById('progress-overlay');
  // Variable to track the highest z-index for draggable elements
  let highestZIndex = 10;

  // ----------------- Global Tooltip for Overlays -----------------
  // Create a tooltip element used for showing annotation class names on overlay hover
  let globalTooltip = document.createElement("div");
  globalTooltip.id = "global-tooltip";
  globalTooltip.style.position = "absolute";
  globalTooltip.style.padding = "4px 8px";
  globalTooltip.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
  globalTooltip.style.color = "#fff";
  globalTooltip.style.borderRadius = "4px";
  globalTooltip.style.fontSize = "0.8rem";
  globalTooltip.style.whiteSpace = "nowrap";
  globalTooltip.style.pointerEvents = "none";
  globalTooltip.style.display = "none";
  globalTooltip.style.zIndex = "101";
  document.body.appendChild(globalTooltip);

  // ----------------- Marker Labels -----------------
  // Create and append marker labels for start, end, and current time markers
  const startLabel = document.createElement('div');
  startLabel.className = 'marker-label';
  startLabel.innerText = "00:00 (Frame: 0)";
  customTimebar.appendChild(startLabel);

  const endLabel = document.createElement('div');
  endLabel.className = 'marker-label';
  endLabel.innerText = "00:00 (Frame: 0)";
  customTimebar.appendChild(endLabel);

  const currentLabel = document.createElement('div');
  currentLabel.className = 'marker-label';
  currentLabel.innerText = "00:00 (Frame: 0)";
  customTimebar.appendChild(currentLabel);

  // ----------------- Helper Function: Update Marker Label -----------------
  /**
   * Update the marker's label position and text based on its current position and time value.
   * @param {HTMLElement} marker - The marker element whose label is being updated.
   * @param {HTMLElement} label - The label element associated with the marker.
   * @param {number} timeValue - The time value (in seconds) corresponding to the marker position.
   */
  function updateMarkerLabel(marker, label, timeValue) {
    const markerLeft = parseFloat(marker.style.left) || 0;
    label.style.left = markerLeft + 'px';
    label.innerText = formatTimeWithFrame(timeValue);
  }

  // ----------------- Load Annotation Classes from Server -----------------
  /**
   * Fetch the list of annotation classes from the server and populate the classes list in the UI.
   */
  function loadClasses() {
    fetch('/classes')
      .then(response => response.json())
      .then(data => {
        const classes = data.classes;
        classesList.innerHTML = '';
        classes.forEach(cls => {
          // Create a list item for each class
          const li = document.createElement('li');
          li.innerText = cls + " ";
          // Create a delete button for each class
          const delBtn = document.createElement('button');
          delBtn.innerText = "Delete";
          delBtn.addEventListener('click', function(e) {
            e.stopPropagation(); // Prevent triggering the li click event
            li.remove();
            updateClassesOnServer();
          });
          li.appendChild(delBtn);
          classesList.appendChild(li);
        });
      })
      .catch(err => console.error("Error loading classes:", err));
  }

  /**
   * Update the annotation classes on the server based on the current UI list.
   */
  function updateClassesOnServer() {
    const classItems = classesList.querySelectorAll('li');
    const classes = [];
    classItems.forEach(li => {
      let cls = li.firstChild.textContent.trim();
      classes.push(cls);
    });
    fetch('/update_classes', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({classes: classes})
    })
    .then(response => response.json())
    .then(data => {
      console.log("Classes updated:", data.classes);
    })
    .catch(err => console.error("Error updating classes:", err));
  }

  // ----------------- Annotation Class Functions -----------------
  // Handle clicks on the classes list to select an annotation class
  classesList.addEventListener('click', function(event) {
    if (event.target.tagName.toLowerCase() === 'button') return;
    const li = event.target.closest('li');
    // Remove 'selected' class from all list items and add to the clicked one
    classesList.querySelectorAll('li').forEach(item => item.classList.remove('selected'));
    li.classList.add('selected');
    selectedAnnotationClass = li.firstChild.textContent.trim();
    console.log("Selected Annotation Class:", selectedAnnotationClass);
  });

  /**
   * Add a new annotation class from the input field.
   */
  function addClass() {
    const newClassInput = document.getElementById('new-class');
    const className = newClassInput.value.trim();
    if (className) {
      const li = document.createElement('li');
      li.innerText = className + " ";
      // Create a delete button for the new class
      const delBtn = document.createElement('button');
      delBtn.innerText = "Delete";
      delBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        li.remove();
        updateClassesOnServer();
      });
      li.appendChild(delBtn);
      classesList.appendChild(li);
      newClassInput.value = '';
      updateClassesOnServer();
    }
  }
  // Expose addClass function to the global scope
  window.addClass = addClass;

  // ----------------- Video List Handling (Right Panel) -----------------
  /**
   * Fetch the list of videos from the server and populate the video list.
   * Depending on the current video mode, either unfinished or finished videos are fetched.
   */
  function fetchVideoList() {
    let endpoint = currentVideoMode === "unfinished" ? '/videos' : '/finished_videos';
    fetch(endpoint)
      .then(response => response.json())
      .then(data => {
        const videoList = document.getElementById('video-list');
        videoList.innerHTML = '';
        data.videos.forEach(video => {
          const li = document.createElement('li');
          const videoText = document.createElement('span');
          videoText.innerText = video;
          li.appendChild(videoText);

          // For unfinished videos, add a red dot if there are annotations
          if (currentVideoMode === "unfinished") {
            const redDot = document.createElement('span');
            redDot.className = "annotation-dot";
            redDot.style.display = "none";
            li.appendChild(redDot);
            fetch('/annotations/' + encodeURIComponent(video))
              .then(response => response.json())
              .then(annotationData => {
                if (annotationData.annotations && annotationData.annotations.length > 0) {
                  redDot.style.display = "inline-block";
                } else {
                  redDot.style.display = "none";
                }
              })
              .catch(err => console.error("Error fetching annotations:", err));
          }

          // Set up click event for each video item to load the video and its annotations
          li.onclick = () => {
            currentVideo = video;
            if (currentVideoMode === "unfinished") {
              videoPlayer.src = '/video/' + encodeURIComponent(video);
              fetch('/annotations/' + encodeURIComponent(video))
                .then(response => response.json())
                .then(data => {
                  displayAnnotations(data.annotations);
                })
                .catch(err => {
                  console.error("Error fetching annotations:", err);
                  displayAnnotations([]);
                });
            } else {
              videoPlayer.src = '/finished_video/' + encodeURIComponent(video);
              fetch('/finished_annotations/' + encodeURIComponent(video))
                .then(response => response.json())
                .then(data => {
                  displayAnnotations(data.annotations);
                })
                .catch(err => {
                  console.error("Error fetching finished annotations:", err);
                  displayAnnotations([]);
                });
            }
            videoPlayer.load();
            document.getElementById('selected-video-name').innerText = video;
            // Highlight the selected video in the list
            Array.from(videoList.children).forEach(item => item.classList.remove('selected'));
            li.classList.add('selected');
            console.log("Loaded video:", video);
          };

          // Mark video as selected if it matches currentVideo
          if (video === currentVideo) {
            li.classList.add('selected');
          }
          
          videoList.appendChild(li);
        });
      })
      .catch(err => console.error("Error fetching video list:", err));
  }
  // Initial fetch and periodic updates for the video list
  fetchVideoList();
  setInterval(fetchVideoList, 5000);

  // ----------------- Video Toggle Buttons -----------------
  // Toggle between unfinished and finished videos
  document.getElementById('toggle-unfinished').addEventListener('click', function() {
    currentVideoMode = "unfinished";
    this.classList.add('active');
    document.getElementById('toggle-finished').classList.remove('active');
    fetchVideoList();
  });
  document.getElementById('toggle-finished').addEventListener('click', function() {
    currentVideoMode = "finished";
    this.classList.add('active');
    document.getElementById('toggle-unfinished').classList.remove('active');
    fetchVideoList();
  });

  // ----------------- Video & Timebar Functions -----------------
  /**
   * Adjust the width of the timebar and video container based on the current center panel width.
   */
  function adjustCenterElements() {
    const containerWidth = document.querySelector('.center-panel').clientWidth;
    customTimebar.style.width = containerWidth + "px";
    document.getElementById('video-container').style.width = containerWidth + "px";
  }

  // When video metadata is loaded, adjust elements and initialize marker positions and labels
  videoPlayer.addEventListener('loadedmetadata', function() {
    adjustCenterElements();
    const barWidth = customTimebar.clientWidth;
    
    // Set markers to their initial positions
    currentMarker.style.left = (-currentMarker.clientWidth / 2) + 'px';
    startMarker.style.left = (-startMarker.clientWidth / 2) + 'px';
    endMarker.style.left = (barWidth - endMarker.clientWidth / 2) + 'px';
    
    endTime = videoPlayer.duration;
    
    // Update marker labels with initial times
    startLabel.style.left = startMarker.style.left;
    startLabel.innerText = formatTimeWithFrame(0);
    currentLabel.style.left = currentMarker.style.left;
    currentLabel.innerText = formatTimeWithFrame(0);
    endLabel.style.left = endMarker.style.left;
    endLabel.innerText = formatTimeWithFrame(endTime);
    
    currentSecondDisplay.innerText = `${formatTime(0)} / ${formatTime(videoPlayer.duration)}`;
  });

  // Update the current marker and display as the video plays
  videoPlayer.addEventListener('timeupdate', function() {
    const progress = videoPlayer.currentTime / videoPlayer.duration;
    const barWidth = customTimebar.clientWidth;
    const markerLeft = progress * barWidth - currentMarker.clientWidth / 2;
    currentMarker.style.left = markerLeft + 'px';
    currentLabel.style.left = markerLeft + 'px';
    currentLabel.innerText = formatTimeWithFrame(videoPlayer.currentTime);
    currentSecondDisplay.innerText = `${formatTime(videoPlayer.currentTime)} / ${formatTime(videoPlayer.duration)}`;
  });
  // Change play/pause button text based on video state
  videoPlayer.addEventListener('play', function() {
    playPauseBtn.innerText = 'Pause';
  });
  videoPlayer.addEventListener('pause', function() {
    playPauseBtn.innerText = 'Play';
  });
  videoPlayer.addEventListener('ended', function() {
    playPauseBtn.innerText = 'Play';
  });

  // Set start/end time on double click on the timebar
  customTimebar.addEventListener('dblclick', function(e) {
    const rect = customTimebar.getBoundingClientRect();
    const clickPos = e.clientX - rect.left;
    const time = (clickPos / customTimebar.clientWidth) * videoPlayer.duration;
    // If click is on the left half, update start marker; otherwise update end marker
    if (clickPos < customTimebar.clientWidth / 2) {
      startTime = time;
      const newLeft = (clickPos - startMarker.clientWidth / 2);
      startMarker.style.left = newLeft + 'px';
      updateMarkerLabel(startMarker, startLabel, startTime);
      console.log('Start time set to: ', startTime);
    } else {
      endTime = time;
      const newLeft = (clickPos - endMarker.clientWidth / 2);
      endMarker.style.left = newLeft + 'px';
      updateMarkerLabel(endMarker, endLabel, endTime);
      console.log('End time set to: ', endTime);
    }
  });

  // Toggle play/pause on button click
  playPauseBtn.addEventListener('click', function() {
    if (videoPlayer.paused) {
      videoPlayer.play();
      playPauseBtn.innerText = 'Pause';
    } else {
      videoPlayer.pause();
      playPauseBtn.innerText = 'Play';
    }
  });

  // ----------------- Annotation Saving & Finalization -----------------
  /**
   * Save the current annotation by sending the selected annotation class, start frame, and end frame to the server.
   */
  window.saveAnnotation = function() {
    if (!selectedAnnotationClass) {
      alert("Please select an annotation class first.");
      return;
    }
    if (startTime >= endTime) {
      alert('Please set valid start and end times.');
      return;
    }
    if (!currentVideo) {
      alert('Please select a video first.');
      return;
    }
    const annotation = {
      start_frame: Math.floor(startTime * defaultFps),
      end_frame: Math.floor(endTime * defaultFps),
      class: selectedAnnotationClass
    };
    const endpoint = currentVideoMode === "unfinished" ? '/save_annotation' : '/save_finished_annotation';
    fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({video: currentVideo, annotation: annotation})
    })
    .then(response => response.json())
    .then(data => {
      alert("Annotation saved for " + currentVideo);
      console.log("Saved annotation:", data);
      // Refresh the annotation list after saving
      const annotationsEndpoint = currentVideoMode === "unfinished" ? '/annotations/' : '/finished_annotations/';
      fetch(annotationsEndpoint + encodeURIComponent(currentVideo))
        .then(response => response.json())
        .then(data => {
          displayAnnotations(data.annotations);
        })
        .catch(err => console.error("Error fetching annotations:", err));
    })
    .catch(err => {
      console.error("Error saving annotation:", err);
      alert("Error saving annotation.");
    });
  };

  /**
   * Finalize the annotation process for the current video.
   * This moves the video (and its annotations) to the finished state.
   */
  window.finalizeAnnotation = function() {
    if (!currentVideo) {
      alert('Please select a video first.');
      return;
    }
    fetch('/finalize_annotation', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({video: currentVideo})
    })
    .then(response => response.json())
    .then(data => {
      alert(data.message);
      fetchVideoList();
      videoPlayer.src = "";
      currentVideo = null;
      document.getElementById('selected-video-name').innerText = "None";
      displayAnnotations([]);
    })
    .catch(err => {
      console.error("Error finalizing annotation:", err);
      alert("Error finalizing annotation.");
    });
  };

  // ----------------- Draggable Marker Helpers -----------------
  /**
   * Convert a position (in pixels) on the timebar to a corresponding time in seconds.
   * @param {number} position - The horizontal position on the timebar.
   * @returns {number} The calculated time in seconds.
   */
  function positionToTime(position) {
    return (position / customTimebar.clientWidth) * videoPlayer.duration;
  }

  /**
   * Ensure a marker's position stays within the bounds of the timebar.
   * @param {number} pos - The new position for the marker.
   * @param {number} markerWidth - The width of the marker.
   * @returns {number} The clamped position.
   */
  function clampPosition(pos, markerWidth) {
    return Math.max(0, Math.min(pos, customTimebar.clientWidth - markerWidth));
  }

  /**
   * Make a marker draggable and update the corresponding time value and label.
   * @param {HTMLElement} marker - The marker element to make draggable.
   * @param {function} updateTime - Callback function to update time (start, end, or current).
   * @param {HTMLElement} [label=null] - Optional label element to update with the time value.
   */
  function makeDraggable(marker, updateTime, label = null) {
    marker.style.position = 'absolute';
    marker.style.cursor = 'pointer';
    marker.setAttribute("tabindex", "0");
    marker.addEventListener('mousedown', function(e) {
      e.preventDefault();
      marker.style.zIndex = ++highestZIndex;
      if (label) { label.style.zIndex = highestZIndex; }
      const barRect = customTimebar.getBoundingClientRect();
      const markerRect = marker.getBoundingClientRect();
      const shiftX = e.clientX - markerRect.left;
      function onMouseMove(e) {
        let newLeft = e.clientX - barRect.left - shiftX;
        newLeft = clampPosition(newLeft, marker.clientWidth);
        marker.style.left = newLeft + 'px';
        const centerPos = newLeft + marker.clientWidth / 2;
        const timeValue = positionToTime(centerPos);
        updateTime(timeValue);
        if (label) {
          updateMarkerLabel(marker, label, timeValue);
        }
      }
      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
    // Allow arrow keys to move the marker for accessibility
    marker.addEventListener('keydown', function(e) {
      let delta = 0;
      const step = 5;
      if (e.key === "ArrowLeft") { delta = -step; }
      else if (e.key === "ArrowRight") { delta = step; }
      if (delta !== 0) {
        e.preventDefault();
        marker.style.zIndex = ++highestZIndex;
        if (label) { label.style.zIndex = highestZIndex; }
        let currentLeft = parseFloat(marker.style.left) || 0;
        let newLeft = clampPosition(currentLeft + delta, marker.clientWidth);
        marker.style.left = newLeft + 'px';
        const centerPos = newLeft + marker.clientWidth / 2;
        const timeValue = positionToTime(centerPos);
        updateTime(timeValue);
        if (label) {
          updateMarkerLabel(marker, label, timeValue);
        }
      }
    });
  }

  // Make markers draggable and update their associated time values and labels
  makeDraggable(startMarker, function(timeValue) {
    startTime = timeValue;
    console.log("Start time (draggable):", startTime);
  }, startLabel);

  makeDraggable(endMarker, function(timeValue) {
    endTime = timeValue;
    console.log("End time (draggable):", endTime);
  }, endLabel);

  makeDraggable(currentMarker, function(timeValue) {
    videoPlayer.currentTime = timeValue;
    console.log("Video current time set to:", timeValue);
  }, currentLabel);

  // Set active marker when clicked
  startMarker.addEventListener('click', function() {
    activeMarker = startMarker;
    console.log("Active marker set to startMarker");
  });
  endMarker.addEventListener('click', function() {
    activeMarker = endMarker;
    console.log("Active marker set to endMarker");
  });
  currentMarker.addEventListener('click', function() {
    activeMarker = currentMarker;
    console.log("Active marker set to currentMarker");
  });

  // Move the active marker left by one frame
  document.getElementById('move-left').addEventListener('click', function() {
    if (!activeMarker) {
      alert("Please click on a marker to select it first.");
      return;
    }
    const frameStep = (customTimebar.clientWidth / videoPlayer.duration) * (1 / defaultFps);
    let currentLeft = parseFloat(activeMarker.style.left) || 0;
    let newLeft = clampPosition(currentLeft - frameStep, activeMarker.clientWidth);
    activeMarker.style.left = newLeft + 'px';
    const centerPos = newLeft + activeMarker.clientWidth / 2;
    const timeValue = positionToTime(centerPos);
    if (activeMarker === startMarker) {
      startTime = timeValue;
      updateMarkerLabel(startMarker, startLabel, timeValue);
    } else if (activeMarker === endMarker) {
      endTime = timeValue;
      updateMarkerLabel(endMarker, endLabel, timeValue);
    } else if (activeMarker === currentMarker) {
      videoPlayer.currentTime = timeValue;
      updateMarkerLabel(currentMarker, currentLabel, timeValue);
    }
    console.log("Marker moved left by one frame. New time:", timeValue);
  });

  // Move the active marker right by one frame
  document.getElementById('move-right').addEventListener('click', function() {
    if (!activeMarker) {
      alert("Please click on a marker to select it first.");
      return;
    }
    const frameStep = (customTimebar.clientWidth / videoPlayer.duration) * (1 / defaultFps);
    let currentLeft = parseFloat(activeMarker.style.left) || 0;
    let newLeft = clampPosition(currentLeft + frameStep, activeMarker.clientWidth);
    activeMarker.style.left = newLeft + 'px';
    const centerPos = newLeft + activeMarker.clientWidth / 2;
    const timeValue = positionToTime(centerPos);
    if (activeMarker === startMarker) {
      startTime = timeValue;
      updateMarkerLabel(startMarker, startLabel, timeValue);
    } else if (activeMarker === endMarker) {
      endTime = timeValue;
      updateMarkerLabel(endMarker, endLabel, timeValue);
    } else if (activeMarker === currentMarker) {
      videoPlayer.currentTime = timeValue;
      updateMarkerLabel(currentMarker, currentLabel, timeValue);
    }
    console.log("Marker moved right by one frame. New time:", timeValue);
  });

  // ----------------- Utility Functions -----------------
  /**
   * Format a given time (in seconds) to a string in the format "MM:SS (Frame: X)".
   * @param {number} seconds - Time in seconds.
   * @returns {string} Formatted time string.
   */
  function formatTimeWithFrame(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frame = Math.floor(seconds * defaultFps);
    return `${minutes < 10 ? "0" : ""}${minutes}:${secs < 10 ? "0" : ""}${secs} (Frame: ${frame})`;
  }
  /**
   * Format a given time (in seconds) to a string in the format "MM:SS".
   * @param {number} seconds - Time in seconds.
   * @returns {string} Formatted time string.
   */
  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes < 10 ? "0" : ""}${minutes}:${secs < 10 ? "0" : ""}${secs}`;
  }

  // ----------------- Draw Annotation Overlays -----------------
  /**
   * Draw semi-transparent overlays on the timebar representing saved annotations.
   * @param {Array} annotations - Array of annotation objects with start_frame, end_frame, and class properties.
   */
  function drawAnnotationOverlays(annotations) {
    const videoDuration = videoPlayer.duration;
    // If video duration is not available yet, wait until metadata is loaded
    if (!videoDuration || videoDuration === Infinity) {
      const onLoaded = function() {
        videoPlayer.removeEventListener('loadedmetadata', onLoaded);
        drawAnnotationOverlays(annotations);
      };
      videoPlayer.addEventListener('loadedmetadata', onLoaded);
      return;
    }
    // Create an overlay container if it doesn't already exist
    let overlayContainer = document.getElementById('annotation-overlay');
    if (!overlayContainer) {
      overlayContainer = document.createElement('div');
      overlayContainer.id = 'annotation-overlay';
      overlayContainer.style.position = 'absolute';
      overlayContainer.style.top = '0';
      overlayContainer.style.left = '0';
      overlayContainer.style.width = '100%';
      overlayContainer.style.height = '100%';
      overlayContainer.style.zIndex = '1';
      customTimebar.appendChild(overlayContainer);
    } else {
      overlayContainer.innerHTML = '';
    }
    const barWidth = customTimebar.clientWidth;
    // For each annotation, create an overlay div
    annotations.forEach(annotation => {
      const startSec = annotation.start_frame / defaultFps;
      const endSec = annotation.end_frame / defaultFps;
      const left = (startSec / videoPlayer.duration) * barWidth;
      const width = ((endSec - startSec) / videoPlayer.duration) * barWidth;
      const overlayDiv = document.createElement('div');
      overlayDiv.style.position = 'absolute';
      overlayDiv.style.left = left + 'px';
      overlayDiv.style.width = width + 'px';
      overlayDiv.style.height = '100%';
      overlayDiv.style.backgroundColor = 'orange';
      overlayDiv.style.opacity = '0.5';
      overlayContainer.appendChild(overlayDiv);

      // Show tooltip with annotation class on mouse hover
      overlayDiv.addEventListener("mouseenter", function(e) {
        globalTooltip.innerText = annotation.class;
        globalTooltip.style.display = "block";
      });
      overlayDiv.addEventListener("mousemove", function(e) {
        globalTooltip.style.left = (e.pageX + 10) + "px";
        globalTooltip.style.top = (e.pageY - 30) + "px";
      });
      overlayDiv.addEventListener("mouseleave", function(e) {
        globalTooltip.style.display = "none";
      });
    });
  }

  // ----------------- Annotations List Functions -----------------
  /**
   * Display the list of current annotations in the UI and draw the overlays.
   * @param {Array} annotations - Array of annotation objects.
   */
  function displayAnnotations(annotations) {
    // Sort annotations by start_frame for consistent ordering
    annotations.sort((a, b) => a.start_frame - b.start_frame);
    const annotationsList = document.getElementById('annotations-list');
    annotationsList.innerHTML = '';
    if (annotations.length === 0) {
      const li = document.createElement('li');
      li.innerText = "No annotations yet.";
      annotationsList.appendChild(li);
    } else {
      annotations.forEach((annotation, index) => {
        const li = document.createElement('li');
        const startSeconds = annotation.start_frame / defaultFps;
        const endSeconds = annotation.end_frame / defaultFps;
        // Button to play the annotated segment
        const playBtn = document.createElement('button');
        playBtn.className = "annotation-play-btn";
        playBtn.innerText = "Play";
        playBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          videoPlayer.currentTime = startSeconds;
          videoPlayer.play();
          playPauseBtn.innerText = 'Pause';
          const barWidth = customTimebar.clientWidth;
          const newLeftStart = (startSeconds / videoPlayer.duration) * barWidth - (startMarker.clientWidth / 2);
          startMarker.style.left = newLeftStart + 'px';
          updateMarkerLabel(startMarker, startLabel, startSeconds);
          const newLeftEnd = (endSeconds / videoPlayer.duration) * barWidth - (endMarker.clientWidth / 2);
          endMarker.style.left = newLeftEnd + 'px';
          updateMarkerLabel(endMarker, endLabel, endSeconds);
        });
        // Text display for the annotation details
        const textSpan = document.createElement('span');
        textSpan.innerText = `Class: ${annotation.class}, Range: ${formatTime(startSeconds)} - ${formatTime(endSeconds)}`;
        // Button to delete the annotation
        const deleteBtn = document.createElement('button');
        deleteBtn.className = "annotation-delete-btn";
        deleteBtn.innerText = "Delete";
        deleteBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          deleteAnnotation(index);
        });
        li.appendChild(playBtn);
        li.appendChild(textSpan);
        li.appendChild(deleteBtn);
        annotationsList.appendChild(li);
      });
    }
    // Draw overlays on the timebar for the annotations
    drawAnnotationOverlays(annotations);
  }

  /**
   * Delete an annotation from the current video by index.
   * @param {number} index - The index of the annotation to delete.
   */
  function deleteAnnotation(index) {
    if (!currentVideo) {
      alert("No video selected.");
      return;
    }
    const endpoint = currentVideoMode === "unfinished" ? '/delete_annotation' : '/delete_finished_annotation';
    fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({video: currentVideo, index: index})
    })
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        alert("Error: " + data.error);
      } else {
        alert("Annotation deleted.");
        displayAnnotations(data.annotations);
      }
    })
    .catch(err => {
      console.error("Error deleting annotation:", err);
      alert("Error deleting annotation.");
    });
  }
  // Expose deleteAnnotation function to the global scope
  window.deleteAnnotation = deleteAnnotation;

  // Load annotation classes when the page is ready
  loadClasses();

  // ----------------- Window Resize Listener -----------------
  // Adjust center elements when the window is resized to maintain layout consistency
  window.addEventListener('resize', function() {
    adjustCenterElements();
  });
});
