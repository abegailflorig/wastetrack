
from io import BytesIO
from pathlib import Path
from threading import Lock
from time import perf_counter

import numpy as np
import tensorflow as tf

from PIL import (
    Image,
    ImageOps,
    UnidentifiedImageError,
)

from fastapi import (
    FastAPI,
    File,
    HTTPException,
    UploadFile,
)

from fastapi.middleware.cors import (
    CORSMiddleware,
)

from starlette.concurrency import (
    run_in_threadpool,
)


# ============================================
# WASTETRACK CNN SETTINGS
# ============================================

BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = (
    BASE_DIR / "best_waste_cnn_5class.keras"
)

CLASS_NAMES = [
    "empty",
    "half-full",
    "full",
    "overflowing",
    "Invalid",
]

IMAGE_SIZE = (224, 224)

MAX_IMAGE_SIZE = 10 * 1024 * 1024

MIN_CONFIDENCE = 0.70

MIN_MARGIN = 0.15

ALLOWED_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}


# ============================================
# CREATE FASTAPI APPLICATION
# ============================================

app = FastAPI(
    title="WasteTrack Fast CNN API",
    version="4.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ============================================
# LOAD CNN MODEL ONCE
# ============================================

model = None
model_error = None

inference_lock = Lock()

try:
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(
            f"Model not found: {MODEL_PATH}"
        )

    model = tf.keras.models.load_model(
        str(MODEL_PATH),
        compile=False,
    )

    # Check that the model has
    # five output classes.

    if (
        model.output_shape[-1]
        != len(CLASS_NAMES)
    ):
        raise ValueError(
            "CNN model must have exactly "
            "five output classes."
        )

    # ========================================
    # WARM UP CNN AT STARTUP
    # ========================================

    # Running a sample prediction helps avoid
    # first-prediction setup overhead.

    warmup_input = tf.zeros(
        (1, *IMAGE_SIZE, 3),
        dtype=tf.float32,
    )

    _ = model(
        warmup_input,
        training=False,
    )

    print("=" * 45)
    print(
        "[WasteTrack] CNN loaded and warmed up!"
    )
    print("Model:", MODEL_PATH.name)
    print("Classes:", CLASS_NAMES)
    print("=" * 45)

except Exception as exc:
    model_error = str(exc)
    model = None

    print(
        "[WasteTrack] CNN load error:",
        model_error,
    )


# ============================================
# HEALTH CHECK
# ============================================

@app.get("/health")
def health():
    return {
        "model_loaded": model is not None,
        "model_file": MODEL_PATH.name,
        "classes": CLASS_NAMES,
        "validation_enabled":
            model is not None,
        "error": model_error,
    }


@app.get("/")
def root():
    return {
        "message": "WasteTrack CNN API",
        "model_loaded": model is not None,
    }


# ============================================
# INVALID PHOTO RESPONSE
# ============================================

def reject(
    reason: str,
    confidence: float = 0.0,
    probabilities=None,
    elapsed_ms: int = 0,
):
    return {
        "is_valid_bin": False,
        "waste_level": None,
        "confidence": float(confidence),
        "reason": reason,
        "probabilities": probabilities,
        "analysis_ms": elapsed_ms,
    }


# ============================================
# FAST CNN INFERENCE FUNCTION
# ============================================

def run_model(
    image_array: np.ndarray
) -> np.ndarray:

    # The direct model call avoids the
    # overhead of model.predict() for
    # individual images.

    # The lock prevents concurrent
    # predictions from competing for
    # the same model during CPU inference.

    with inference_lock:
        input_tensor = tf.convert_to_tensor(
            image_array,
            dtype=tf.float32,
        )

        output = model(
            input_tensor,
            training=False,
        )

        return np.asarray(
            output.numpy()[0],
            dtype=np.float64,
        )


# ============================================
# PREDICT ENDPOINT
# ============================================

@app.post("/predict")
async def predict(
    file: UploadFile = File(...)
):
    started = perf_counter()

    # ========================================
    # STEP 1: VERIFY CNN MODEL
    # ========================================

    if model is None:
        raise HTTPException(
            status_code=503,
            detail=(
                f"CNN unavailable: {model_error}"
            ),
        )

    # ========================================
    # STEP 2: VALIDATE FILE TYPE
    # ========================================

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=(
                "Upload a JPG, PNG, or WebP photo."
            ),
        )

    # ========================================
    # STEP 3: READ PHOTO
    # ========================================

    try:
        contents = await file.read(
            MAX_IMAGE_SIZE + 1
        )
    finally:
        await file.close()

    if len(contents) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=(
                "Maximum upload size is 10 MB."
            ),
        )

    if not contents:
        return reject(
            "Empty image file."
        )

    # ========================================
    # STEP 4: PREPROCESS IMAGE
    # ========================================

    try:
        # Verify actual image content.
        with Image.open(
            BytesIO(contents)
        ) as test:
            test.verify()

        # Reopen after verification.
        with Image.open(
            BytesIO(contents)
        ) as original:

            image = ImageOps.exif_transpose(
                original
            ).convert("RGB")

            # Model was trained with 224x224.
            image = image.resize(
                IMAGE_SIZE,
                Image.Resampling.BILINEAR,
            )

            image_array = np.asarray(
                image,
                dtype=np.float32,
            )

            # Add batch dimension.
            # (224,224,3) -> (1,224,224,3)

            image_array = np.expand_dims(
                image_array,
                axis=0,
            )

    except (
        UnidentifiedImageError,
        ValueError,
        OSError,
        Image.DecompressionBombError,
    ):
        return reject(
            "Invalid or damaged photo."
        )

    # IMPORTANT:
    # Your five-class training model
    # already contains MobileNetV2
    # preprocessing.
    #
    # Do not divide the pixels by 255.

    # ========================================
    # STEP 5: RUN FAST CNN PREDICTION
    # ========================================

    try:
        scores = await run_in_threadpool(
            run_model,
            image_array,
        )

    except Exception as exc:
        print(
            "[WasteTrack] Inference error:",
            exc,
        )

        raise HTTPException(
            status_code=500,
            detail="CNN inference failed.",
        )

    # ========================================
    # STEP 6: VALIDATE MODEL OUTPUT
    # ========================================

    if (
        scores.shape != (len(CLASS_NAMES),)
        or not np.all(np.isfinite(scores))
        or np.any(scores < 0)
        or np.any(scores > 1)
        or not np.isclose(
            scores.sum(),
            1.0,
            atol=1e-3,
        )
    ):
        raise HTTPException(
            status_code=500,
            detail="Invalid softmax output.",
        )

    # ========================================
    # STEP 7: IDENTIFY PREDICTED CLASS
    # ========================================

    predicted_index = int(
        np.argmax(scores)
    )

    predicted_class = CLASS_NAMES[
        predicted_index
    ]

    confidence = float(
        scores[predicted_index]
    )

    # Difference between the highest
    # and second-highest probability.

    sorted_scores = np.sort(scores)

    margin = float(
        sorted_scores[-1] -
        sorted_scores[-2]
    )

    probabilities = {
        name: round(
            float(probability),
            4
        )
        for name, probability in zip(
            CLASS_NAMES,
            scores,
        )
    }

    elapsed_ms = round(
        (perf_counter() - started) * 1000
    )

    print(
        "[WasteTrack] CNN result:",
        predicted_class
    )

    print(
        "[WasteTrack] Confidence:",
        confidence
    )

    print(
        "[WasteTrack] Analysis time:",
        elapsed_ms,
        "ms"
    )

    # ========================================
    # STEP 8: REJECT INVALID PHOTOS
    # ========================================

    if predicted_class == "Invalid":
        return reject(
            reason=(
                "Invalid Photo: This does not "
                "appear to be a supported "
                "waste-bin image."
            ),
            confidence=confidence,
            probabilities=probabilities,
            elapsed_ms=elapsed_ms,
        )

    # ========================================
    # STEP 9: REJECT UNCERTAIN PHOTOS
    # ========================================

    if (
        confidence < MIN_CONFIDENCE
        or margin < MIN_MARGIN
    ):
        return reject(
            reason=(
                "The photo is unclear or the "
                "CNN prediction is uncertain. "
                "Please choose another bin photo."
            ),
            confidence=confidence,
            probabilities=probabilities,
            elapsed_ms=elapsed_ms,
        )

    # ========================================
    # STEP 10: RETURN VALID CNN RESULT
    # ========================================

    return {
        "is_valid_bin": True,
        "waste_level": predicted_class,
        "confidence": confidence,
        "reason": None,
        "probabilities": probabilities,
        "analysis_ms": elapsed_ms,
    }
