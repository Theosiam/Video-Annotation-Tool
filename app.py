from flask import Flask, request, jsonify, send_from_directory
import os
import json
import shutil

# Initialize Flask app
app = Flask(__name__)

# Define base directory for shared files
BASE_DIR = "/mnt/share/ultimo/"
# Directory where video files are stored
VIDEOS_FOLDER = os.path.join(BASE_DIR, "autotrust_data")
# Directory for videos and their annotations that have been finalized (done)
DONE_ANNOTATIONS_DIR = os.path.join(BASE_DIR, "autotrust_data/Done_annotations")
# Ensure the directory for finished annotations exists
os.makedirs(DONE_ANNOTATIONS_DIR, exist_ok=True)
# Path to the JSON file that holds annotation classes
CLASS_FILE = os.path.join(os.path.dirname(__file__), "annotation_classes.json")

def load_annotation_classes():
    """
    Load annotation classes from a JSON file.
    If the file does not exist, create it with default classes.
    """
    if os.path.exists(CLASS_FILE):
        with open(CLASS_FILE, 'r') as f:
            return json.load(f)
    else:
        # Default annotation classes list
        classes = [
            "Safe driving",
            "Texting on phone",
            "Drinking",
            "Reaching Behind",
            "Talking to passenger",
            "Adjusting Radio"
        ]
        # Save the default classes to the JSON file
        save_annotation_classes(classes)
        return classes

def save_annotation_classes(classes):
    """
    Save annotation classes to the JSON file.
    This function writes the classes list to the file in a formatted JSON structure.
    """
    with open(CLASS_FILE, 'w') as f:
        json.dump(classes, f, indent=4)

@app.route('/')
def index():
    """
    Serve the main index.html file.
    This endpoint is the entry point for the web application.
    """
    return send_from_directory('static', 'index.html')

@app.route('/videos', methods=['GET'])
def list_videos():
    """
    List all unfinished video files from VIDEOS_FOLDER.
    This endpoint returns a JSON object containing a list of video filenames.
    """
    videos = [file for file in os.listdir(VIDEOS_FOLDER)
              if file.endswith(('.mp4', '.avi', '.mov', '.mkv'))]
    return jsonify({'videos': videos})

@app.route('/finished_videos', methods=['GET'])
def finished_videos():
    """
    List all finished video files from DONE_ANNOTATIONS_DIR.
    Finished videos are those that have been finalized.
    """
    finished = [file for file in os.listdir(DONE_ANNOTATIONS_DIR)
                if file.endswith(('.mp4', '.avi', '.mov', '.mkv'))]
    return jsonify({'videos': finished})

@app.route('/video/<path:video_name>', methods=['GET'])
def serve_video(video_name):
    """
    Serve a video file from VIDEOS_FOLDER.
    The video file specified by video_name is sent to the client.
    """
    return send_from_directory(VIDEOS_FOLDER, video_name)

@app.route('/save_annotation', methods=['POST'])
def save_annotation():
    """
    Save an annotation for a video by storing it in a JSON file.
    The endpoint expects JSON data containing the video name and annotation details.
    If an annotation file already exists for the video, the new annotation is appended.
    """
    data = request.json
    video_name = data.get('video')
    annotation = data.get('annotation')
    
    if not video_name or not annotation:
        return jsonify({'error': 'Missing video name or annotation'}), 400
    
    # Define the path for the video's annotation JSON file
    json_path = os.path.join(VIDEOS_FOLDER, f"{video_name}.json")
    if os.path.exists(json_path):
        # If file exists, load the existing annotations and append the new one
        with open(json_path, 'r') as f:
            existing_data = json.load(f)
        existing_data['annotations'].append(annotation)
    else:
        # Create a new annotation JSON structure if none exists
        existing_data = {'video': video_name, 'annotations': [annotation]}
    
    # Save the updated annotations back to the file
    with open(json_path, 'w') as f:
        json.dump(existing_data, f, indent=4)
    
    return jsonify({'message': 'Annotation saved successfully', 'data': existing_data})

@app.route('/finalize_annotation', methods=['POST'])
def finalize_annotation():
    """
    Finalize a video annotation by moving the video and its JSON annotation file
    from VIDEOS_FOLDER to DONE_ANNOTATIONS_DIR. This signifies that the annotation process is complete.
    """
    data = request.json
    video_name = data.get('video')
    
    if not video_name:
        return jsonify({'error': 'Missing video name'}), 400
    
    # Define the paths for the video file and its associated JSON file
    video_path = os.path.join(VIDEOS_FOLDER, video_name)
    json_path = os.path.join(VIDEOS_FOLDER, f"{video_name}.json")
    
    if not os.path.exists(video_path):
        return jsonify({'error': 'Video file not found'}), 404
    
    # Move the video file to the finished annotations directory
    shutil.move(video_path, os.path.join(DONE_ANNOTATIONS_DIR, video_name))
    # If the JSON annotation file exists, move it as well
    if os.path.exists(json_path):
        shutil.move(json_path, os.path.join(DONE_ANNOTATIONS_DIR, f"{video_name}.json"))
    
    return jsonify({'message': 'Video and annotations moved to Done_annotations'})

@app.route('/annotations/<video_name>', methods=['GET'])
def get_annotations(video_name):
    """
    Retrieve annotations for a given video from VIDEOS_FOLDER.
    Reads the JSON file associated with the video and returns its contents.
    """
    json_path = os.path.join(VIDEOS_FOLDER, f"{video_name}.json")
    if os.path.exists(json_path):
        with open(json_path, 'r') as f:
            data = json.load(f)
        return jsonify(data)
    else:
        return jsonify({'video': video_name, 'annotations': []})

@app.route('/delete_annotation', methods=['POST'])
def delete_annotation():
    """
    Delete a specific annotation from a video's JSON file.
    The request should include the video name and the index of the annotation to delete.
    """
    data = request.json
    video_name = data.get('video')
    annotation_index = data.get('index')
    if not video_name or annotation_index is None:
        return jsonify({'error': 'Missing video or annotation index'}), 400
    
    # Define the path for the annotation file
    json_path = os.path.join(VIDEOS_FOLDER, f"{video_name}.json")
    if not os.path.exists(json_path):
        return jsonify({'error': 'Annotation file not found'}), 404
    
    # Load the existing annotations
    with open(json_path, 'r') as f:
        existing_data = json.load(f)
    
    # Get the list of annotations and sort them by the 'start_frame' key
    annotations = existing_data.get('annotations', [])
    annotations.sort(key=lambda a: a['start_frame'])
    
    try:
        annotation_index = int(annotation_index)
    except ValueError:
        return jsonify({'error': 'Annotation index must be an integer'}), 400
    
    # Validate that the annotation index is within the proper range
    if annotation_index < 0 or annotation_index >= len(annotations):
        return jsonify({'error': 'Invalid annotation index'}), 400
    
    # Remove the specified annotation and update the JSON file
    annotations.pop(annotation_index)
    existing_data['annotations'] = annotations
    
    with open(json_path, 'w') as f:
        json.dump(existing_data, f, indent=4)
    
    return jsonify({'message': 'Annotation deleted', 'annotations': annotations})

@app.route('/classes', methods=['GET'])
def get_classes():
    """
    Retrieve the list of annotation classes.
    Loads the classes from a JSON file and returns them as a JSON response.
    """
    classes = load_annotation_classes()
    return jsonify({"classes": classes})

@app.route('/update_classes', methods=['POST'])
def update_classes():
    """
    Update the annotation classes with the provided list.
    The new list is received in JSON format and then saved to the classes file.
    """
    data = request.json
    classes = data.get("classes")
    if classes is None:
        return jsonify({"error": "Missing classes list"}), 400
    save_annotation_classes(classes)
    return jsonify({"message": "Classes updated", "classes": classes})

@app.route('/finished_video/<path:video_name>', methods=['GET'])
def serve_finished_video(video_name):
    """
    Serve a finished video file from DONE_ANNOTATIONS_DIR.
    This is used to access videos that have been finalized.
    """
    return send_from_directory(DONE_ANNOTATIONS_DIR, video_name)

@app.route('/finished_annotations/<video_name>', methods=['GET'])
def finished_annotations(video_name):
    """
    Retrieve annotations for a finished video.
    The JSON file associated with the finished video is read and returned.
    """
    json_path = os.path.join(DONE_ANNOTATIONS_DIR, f"{video_name}.json")
    if os.path.exists(json_path):
        with open(json_path, 'r') as f:
            data = json.load(f)
        return jsonify(data)
    else:
        return jsonify({'video': video_name, 'annotations': []})

@app.route('/save_finished_annotation', methods=['POST'])
def save_finished_annotation():
    """
    Save an annotation for a finished video.
    Similar to save_annotation, but operates in the DONE_ANNOTATIONS_DIR directory.
    """
    data = request.json
    video_name = data.get('video')
    annotation = data.get('annotation')
    
    if not video_name or not annotation:
        return jsonify({'error': 'Missing video name or annotation'}), 400
    
    # Define the path for the finished video's annotation JSON file
    json_path = os.path.join(DONE_ANNOTATIONS_DIR, f"{video_name}.json")
    if os.path.exists(json_path):
        with open(json_path, 'r') as f:
            existing_data = json.load(f)
        existing_data['annotations'].append(annotation)
    else:
        existing_data = {'video': video_name, 'annotations': [annotation]}
    
    # Save the updated annotations for the finished video
    with open(json_path, 'w') as f:
        json.dump(existing_data, f, indent=4)
    
    return jsonify({'message': 'Annotation saved successfully', 'data': existing_data})

@app.route('/delete_finished_annotation', methods=['POST'])
def delete_finished_annotation():
    """
    Delete a specific annotation from a finished video's JSON file.
    The process is similar to delete_annotation but operates on files in DONE_ANNOTATIONS_DIR.
    """
    data = request.json
    video_name = data.get('video')
    annotation_index = data.get('index')
    if not video_name or annotation_index is None:
        return jsonify({'error': 'Missing video or annotation index'}), 400
    
    json_path = os.path.join(DONE_ANNOTATIONS_DIR, f"{video_name}.json")
    if not os.path.exists(json_path):
        return jsonify({'error': 'Annotation file not found'}), 404
    
    # Load existing annotations from the finished video's JSON file
    with open(json_path, 'r') as f:
        existing_data = json.load(f)
    
    # Sort the annotations by their 'start_frame'
    annotations = existing_data.get('annotations', [])
    annotations.sort(key=lambda a: a['start_frame'])
    
    try:
        annotation_index = int(annotation_index)
    except ValueError:
        return jsonify({'error': 'Annotation index must be an integer'}), 400
    
    # Ensure the provided annotation index is valid
    if annotation_index < 0 or annotation_index >= len(annotations):
        return jsonify({'error': 'Invalid annotation index'}), 400
    
    # Remove the annotation at the specified index and update the file
    annotations.pop(annotation_index)
    existing_data['annotations'] = annotations
    
    with open(json_path, 'w') as f:
        json.dump(existing_data, f, indent=4)
    
    return jsonify({'message': 'Annotation deleted', 'annotations': annotations})

# Run the Flask application. Listens on all interfaces at port 10200 with debug mode enabled.
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10200, debug=True)
