interface CustomWorkoutValidationExercise {
  exerciseName: string;
}

interface CustomWorkoutValidationInput {
  sessionDate: string;
  exercises: CustomWorkoutValidationExercise[];
}

export function getCustomWorkoutValidationState(input: CustomWorkoutValidationInput) {
  if (!input.sessionDate.trim()) {
    return {
      canSubmit: false,
      message: "Inserisci la data della sessione."
    };
  }

  if (!input.exercises.some((exercise) => exercise.exerciseName.trim())) {
    return {
      canSubmit: false,
      message: "Aggiungi almeno un esercizio al custom workout."
    };
  }

  return {
    canSubmit: true,
    message: null
  };
}
