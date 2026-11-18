import sys
import json
import argparse
import os
import math
import subprocess
import tempfile
import shutil

try:
    import cv2
    import numpy as np
except ImportError:
    print(json.dumps({"success": False, "error": "cv2 or numpy missing"}))
    sys.exit(0)

def merge_boxes(boxes):
    if not boxes:
        return []
    # Convert all boxes to [x, y, w, h] format
    boxes = [list(b) for b in boxes]
    merged = []
    
    while len(boxes) > 0:
        box = boxes.pop(0)
        overlap_idx = -1
        for idx, m_box in enumerate(merged):
            # Calculate intersection area
            ix1 = max(box[0], m_box[0])
            iy1 = max(box[1], m_box[1])
            ix2 = min(box[0] + box[2], m_box[0] + m_box[2])
            iy2 = min(box[1] + box[3], m_box[1] + m_box[3])
            
            if ix2 > ix1 and iy2 > iy1:
                int_area = (ix2 - ix1) * (iy2 - iy1)
                area1 = box[2] * box[3]
                area2 = m_box[2] * m_box[3]
                overlap_ratio = int_area / min(area1, area2)
                if overlap_ratio > 0.4:
                    overlap_idx = idx
                    break
        
        if overlap_idx >= 0:
            # Merge boxes by taking union bounding box
            m_box = merged[overlap_idx]
            nx1 = min(box[0], m_box[0])
            ny1 = min(box[1], m_box[1])
            nx2 = max(box[0] + box[2], m_box[0] + m_box[2])
            ny2 = max(box[1] + box[3], m_box[1] + m_box[3])
            merged[overlap_idx] = [nx1, ny1, nx2 - nx1, ny2 - ny1]
        else:
            merged.append(box)
            
    return merged

def kmeans_1d(data, k, max_iters=100):
    if len(data) == 0:
        return [], []
    if k == 1:
        center = sum(data) / len(data)
        return [center], [0] * len(data)
    
    # Initialize cluster centers (min and max of data)
    c1 = min(data)
    c2 = max(data)
    
    for _ in range(max_iters):
        labels = []
        for x in data:
            d1 = abs(x - c1)
            d2 = abs(x - c2)
            if d1 < d2:
                labels.append(0)
            else:
                labels.append(1)
        
        cluster0 = [data[i] for i in range(len(data)) if labels[i] == 0]
        cluster1 = [data[i] for i in range(len(data)) if labels[i] == 1]
        
        new_c1 = sum(cluster0) / len(cluster0) if len(cluster0) > 0 else c1
        new_c2 = sum(cluster1) / len(cluster1) if len(cluster1) > 0 else c2
        
        if abs(new_c1 - c1) < 1e-3 and abs(new_c2 - c2) < 1e-3:
            c1, c2 = new_c1, new_c2
            break
        c1, c2 = new_c1, new_c2
        
    # Ensure c1 < c2
    if c1 > c2:
        c1, c2 = c2, c1
        labels = [1 - l for l in labels]
        
    return [c1, c2], labels

def main():
    parser = argparse.ArgumentParser(description="Robust multi-cascade face tracking and clustering")
    parser.add_argument("--video", required=True, help="Path to video file")
    parser.add_argument("--start", type=float, default=0.0, help="Start time in seconds")
    parser.add_argument("--duration", type=float, default=10.0, help="Duration in seconds")
    parser.add_argument("--interval", type=float, default=0.5, help="Sampling interval in seconds")
    args = parser.parse_args()

    video_path = args.video
    if not os.path.exists(video_path):
        print(json.dumps({"success": False, "error": f"File not found: {video_path}"}))
        return

    # Check dimensions of original video
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(json.dumps({"success": False, "error": f"Failed to open video: {video_path}"}))
        return
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    fallback_center = int(src_w * 0.5)
    fallback_left = int(src_w * 0.25)
    fallback_right = int(src_w * 0.75)
    fallback_y = int(src_h * 0.35)

    # Load Haar cascades - check multiple locations
    script_dir = os.path.dirname(os.path.abspath(__file__))
    local_haardir = os.path.join(script_dir, "haarcascades")
    cv_haardir = getattr(cv2.data, 'haarcascades', '')

    frontal_cascade_path = os.path.join(local_haardir, 'haarcascade_frontalface_default.xml')
    if not os.path.exists(frontal_cascade_path) and cv_haardir:
        frontal_cascade_path = os.path.join(cv_haardir, 'haarcascade_frontalface_default.xml')

    profile_cascade_path = os.path.join(local_haardir, 'haarcascade_profileface.xml')
    if not os.path.exists(profile_cascade_path) and cv_haardir:
        profile_cascade_path = os.path.join(cv_haardir, 'haarcascade_profileface.xml')
    
    if not os.path.exists(frontal_cascade_path) or not os.path.exists(profile_cascade_path):
        print(json.dumps({
            "success": True,
            "speakerCount": 1,
            "xLeft": fallback_center,
            "yLeft": fallback_y,
            "xRight": fallback_center,
            "yRight": fallback_y,
            "motionHistory": [],
            "details": "Haar cascades not found, fallback to center"
        }))
        return

    face_cascade = cv2.CascadeClassifier(frontal_cascade_path)
    profile_cascade = cv2.CascadeClassifier(profile_cascade_path)

    # Create temporary directory for frame extraction
    temp_dir = tempfile.mkdtemp()
    
    try:
        fps = 2.0  # Extract 2 frames per second (interval = 0.5s)
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(args.start),
            "-i", video_path,
            "-t", str(args.duration),
            "-vf", f"fps={fps},scale=640:-2",
            "-q:v", "4",
            "-an",
            os.path.join(temp_dir, "frame_%04d.jpg")
        ]
        
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode != 0:
            print(json.dumps({
                "success": True,
                "speakerCount": 1,
                "xLeft": fallback_center,
                "yLeft": fallback_y,
                "xRight": fallback_center,
                "yRight": fallback_y,
                "motionHistory": [],
                "details": f"FFmpeg failed with code {result.returncode}, fallback to center"
            }))
            return

        # List extracted frames
        files = sorted([f for f in os.listdir(temp_dir) if f.endswith(".jpg")])
        if not files:
            print(json.dumps({
                "success": True,
                "speakerCount": 1,
                "xLeft": fallback_center,
                "yLeft": fallback_y,
                "xRight": fallback_center,
                "yRight": fallback_y,
                "motionHistory": [],
                "details": "No frames extracted by FFmpeg"
            }))
            return

        n_frames = len(files)
        frame_detections = []
        all_cxs = []
        all_cys = []
        pair_left_cxs = []
        pair_left_cys = []
        pair_right_cxs = []
        pair_right_cys = []
        
        # Minimum face width in source pixels (e.g. 110px in 1920x1080)
        min_face_w = max(50, int(src_w * 0.055))

        for idx, filename in enumerate(files):
            file_path = os.path.join(temp_dir, filename)
            frame = cv2.imread(file_path)
            if frame is None:
                frame_detections.append([])
                continue
                
            h_resized, w_resized = frame.shape[:2]
            scale = w_resized / src_w  # Mapping ratio
            
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            # 1. Frontal faces
            frontal_faces = face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=4,
                minSize=(28, 28)
            )
            
            # 2. Right profiles
            profile_faces = profile_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=4,
                minSize=(28, 28)
            )
            
            # 3. Left profiles (flip frame horizontally)
            gray_flipped = cv2.flip(gray, 1)
            flipped_profile_faces_raw = profile_cascade.detectMultiScale(
                gray_flipped,
                scaleFactor=1.1,
                minNeighbors=4,
                minSize=(28, 28)
            )
            flipped_profile_faces = []
            for (x, y, w, h) in flipped_profile_faces_raw:
                orig_x = w_resized - x - w
                flipped_profile_faces.append((orig_x, y, w, h))
                
            # Merge overlapping detections (frontal + right profile + left profile)
            raw_boxes = list(frontal_faces) + list(profile_faces) + flipped_profile_faces
            merged_boxes = merge_boxes(raw_boxes)
            
            t_offset = args.start + idx * (1.0 / fps)
            dets = []
            for (x, y, w, h) in merged_boxes:
                orig_cx = int((x + w / 2) / scale)
                orig_cy = int((y + h / 2) / scale)
                orig_w = int(w / scale)
                orig_h = int(h / scale)
                
                # Filter out tiny noise / background decorations
                if orig_w < min_face_w:
                    continue
                if not ((0.03 * src_w) < orig_cx < (0.97 * src_w)):
                    continue

                det = {
                    "cx": orig_cx,
                    "cy": orig_cy,
                    "w": orig_w,
                    "h": orig_h,
                    "box": (x, y, w, h),
                    "t": t_offset
                }
                dets.append(det)
                all_cxs.append(orig_cx)
                all_cys.append(orig_cy)

            # Sort detected faces left-to-right
            dets.sort(key=lambda d: d["cx"])
            
            # Check for simultaneous multi-speaker presence (podcast 2-shot)
            if len(dets) >= 2:
                d_left = dets[0]
                d_right = dets[-1]
                if (d_right["cx"] - d_left["cx"]) > (0.22 * src_w):
                    pair_left_cxs.append(d_left["cx"])
                    pair_left_cys.append(d_left["cy"])
                    pair_right_cxs.append(d_right["cx"])
                    pair_right_cys.append(d_right["cy"])
                    
            frame_detections.append(dets)

        # Determine speaker count and coordinates
        speaker_count = 1
        x_left = fallback_center
        y_left = fallback_y
        x_right = fallback_center
        y_right = fallback_y

        if len(pair_left_cxs) >= 2:
            # Clear 2-speaker wide shot detected!
            x_left = int(np.median(pair_left_cxs))
            y_left = int(np.median(pair_left_cys))
            x_right = int(np.median(pair_right_cxs))
            y_right = int(np.median(pair_right_cys))
            speaker_count = 2
        elif len(all_cxs) > 0:
            if len(all_cxs) < 5:
                x_left = int(np.median(all_cxs))
                y_left = int(np.median(all_cys)) if all_cys else fallback_y
                x_right = x_left
                y_right = y_left
                speaker_count = 1
            else:
                centers, labels = kmeans_1d(all_cxs, k=2)
                c1, c2 = centers[0], centers[1]
                count1 = sum(1 for l in labels if l == 0)
                count2 = sum(1 for l in labels if l == 1)
                total = count1 + count2
                min_dist = 0.18 * src_w
                if (c2 - c1) < min_dist or count1 < 3 or count2 < 3 or (count1 / total) < 0.12 or (count2 / total) < 0.12:
                    x_left = int(np.median(all_cxs))
                    y_left = int(np.median(all_cys)) if all_cys else fallback_y
                    x_right = x_left
                    y_right = y_left
                    speaker_count = 1
                else:
                    x_left = int(c1)
                    x_right = int(c2)
                    c0_cys = [all_cys[i] for i in range(len(all_cys)) if labels[i] == 0]
                    c1_cys = [all_cys[i] for i in range(len(all_cys)) if labels[i] == 1]
                    y_left = int(np.median(c0_cys)) if c0_cys else fallback_y
                    y_right = int(np.median(c1_cys)) if c1_cys else fallback_y
                    speaker_count = 2

        # Assign detections to left and right tracks based on cluster proximity
        left_track = [None] * n_frames
        right_track = [None] * n_frames
        
        for idx in range(n_frames):
            dets = frame_detections[idx]
            if not dets:
                continue
                
            if speaker_count == 1:
                # Assign the box closest to the single speaker center
                best_det = min(dets, key=lambda d: abs(d["cx"] - x_left))
                left_track[idx] = best_det
                right_track[idx] = best_det
            else:
                # Two speakers: partition detections in this frame
                left_group = []
                right_group = []
                for d in dets:
                    d_left = abs(d["cx"] - x_left)
                    d_right = abs(d["cx"] - x_right)
                    if d_left < d_right:
                        left_group.append(d)
                    else:
                        right_group.append(d)
                        
                if left_group:
                    # Choose the largest detected box for the left speaker
                    left_track[idx] = max(left_group, key=lambda d: d["box"][2])
                if right_group:
                    # Choose the largest detected box for the right speaker
                    right_track[idx] = max(right_group, key=lambda d: d["box"][2])

        # Interpolate small tracking gaps (up to 3 seconds / 6 frames)
        def interpolate_track(track):
            n = len(track)
            i = 0
            while i < n:
                if track[i] is not None:
                    j = i + 1
                    while j < n and track[j] is None:
                        j += 1
                    if j < n:
                        gap = j - i - 1
                        if 0 < gap <= 6:
                            for k in range(1, gap + 1):
                                weight = k / (gap + 1)
                                cx = int(track[i]["cx"] * (1 - weight) + track[j]["cx"] * weight)
                                cy = int(track[i]["cy"] * (1 - weight) + track[j]["cy"] * weight)
                                w  = int(track[i]["w"] * (1 - weight) + track[j]["w"] * weight)
                                h  = int(track[i]["h"] * (1 - weight) + track[j]["h"] * weight)
                                
                                small_x = int(track[i]["box"][0] * (1 - weight) + track[j]["box"][0] * weight)
                                small_y = int(track[i]["box"][1] * (1 - weight) + track[j]["box"][1] * weight)
                                small_w = int(track[i]["box"][2] * (1 - weight) + track[j]["box"][2] * weight)
                                small_h = int(track[i]["box"][3] * (1 - weight) + track[j]["box"][3] * weight)
                                
                                track[i + k] = {
                                    "t": track[i]["t"] + k * (1.0 / fps),
                                    "cx": cx,
                                    "cy": cy,
                                    "w": w,
                                    "h": h,
                                    "box": (small_x, small_y, small_w, small_h)
                                }
                        i = j
                    else:
                        i += 1
                else:
                    i += 1

        interpolate_track(left_track)
        interpolate_track(right_track)

        # Calculate mouth motion using Gaussian blurred crops to filter out noise
        motion_history = []
        prev_mouth_left = None
        prev_mouth_right = None

        for idx, filename in enumerate(files):
            file_path = os.path.join(temp_dir, filename)
            frame = cv2.imread(file_path)
            if frame is None:
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            t_offset = args.start + idx * (1.0 / fps)
            
            # Left speaker mouth motion
            motion_left = 0.0
            det_left = left_track[idx]
            if det_left is not None:
                x, y, w, h = det_left["box"]
                my1 = max(0, y + int(h * 0.65))
                my2 = min(gray.shape[0], y + h)
                mx1 = max(0, x + int(w * 0.15))
                mx2 = min(gray.shape[1], x + int(w * 0.85))
                mouth_crop = gray[my1:my2, mx1:mx2]
                
                if mouth_crop.size > 0:
                    mouth_resized = cv2.resize(mouth_crop, (50, 30), interpolation=cv2.INTER_AREA)
                    mouth_blurred = cv2.GaussianBlur(mouth_resized, (5, 5), 0)
                    if prev_mouth_left is not None:
                        diff = cv2.absdiff(mouth_blurred, prev_mouth_left)
                        motion_left = float(np.mean(diff))
                    prev_mouth_left = mouth_blurred
            else:
                prev_mouth_left = None

            # Right speaker mouth motion
            motion_right = 0.0
            det_right = right_track[idx]
            if det_right is not None:
                x, y, w, h = det_right["box"]
                my1 = max(0, y + int(h * 0.65))
                my2 = min(gray.shape[0], y + h)
                mx1 = max(0, x + int(w * 0.15))
                mx2 = min(gray.shape[1], x + int(w * 0.85))
                mouth_crop = gray[my1:my2, mx1:mx2]
                
                if mouth_crop.size > 0:
                    mouth_resized = cv2.resize(mouth_crop, (50, 30), interpolation=cv2.INTER_AREA)
                    mouth_blurred = cv2.GaussianBlur(mouth_resized, (5, 5), 0)
                    if prev_mouth_right is not None:
                        diff = cv2.absdiff(mouth_blurred, prev_mouth_right)
                        motion_right = float(np.mean(diff))
                    prev_mouth_right = mouth_blurred
            else:
                prev_mouth_right = None

            motion_history.append({
                "t": t_offset,
                "left": round(motion_left, 2),
                "right": round(motion_right, 2)
            })

        print(json.dumps({
            "success": True,
            "speakerCount": speaker_count,
            "xLeft": x_left,
            "yLeft": y_left,
            "xRight": x_right,
            "yRight": y_right,
            "motionHistory": motion_history,
            "details": f"Multi-cascade tracking success. Detected {speaker_count} speakers. Left=({x_left},{y_left}), Right=({x_right},{y_right})"
        }))

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
