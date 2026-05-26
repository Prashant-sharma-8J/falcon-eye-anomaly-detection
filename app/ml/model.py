try:
    from tensorflow.keras.layers import Dense, Input
    from tensorflow.keras.models import Model
except ModuleNotFoundError:
    from keras.layers import Dense, Input
    from keras.models import Model


def build_autoencoder(input_dim: int, latent_dim: int = 8) -> Model:
    first_hidden = max(2, int(input_dim * 0.75))
    second_hidden = max(2, int(input_dim * 0.5))

    inputs = Input(shape=(input_dim,))
    x = Dense(first_hidden, activation="relu")(inputs)
    x = Dense(second_hidden, activation="relu")(x)
    latent = Dense(max(1, latent_dim), activation="relu")(x)
    x = Dense(second_hidden, activation="relu")(latent)
    x = Dense(first_hidden, activation="relu")(x)
    outputs = Dense(input_dim, activation="linear")(x)

    model = Model(inputs=inputs, outputs=outputs)
    model.compile(optimizer="adam", loss="mse")
    return model
