/**
 * API operations for routine builder.
 * Handles all API calls for creating, updating routines and managing folders.
 * @module actions/RoutineBuilderApi
 */

/**
 * Gets API client and key, throwing if key is missing
 * @returns {{client: Object, apiKey: string}} API client and key
 * @private
 */
function getApiClientAndKey() {
  const apiKey = getApiClient().apiKeyManager.getApiKeyFromProperties();
  if (!apiKey) {
    throw new ConfigurationError("API key not found");
  }
  return { client: getApiClient(), apiKey };
}

/**
 * Submits routine to the API
 * @param {Object} routineData - The routine payload to send
 * @returns {Promise<Object>} Parsed response from the API
 */
async function submitRoutine(routineData) {
  const { client, apiKey } = getApiClientAndKey();
  const options = client.createRequestOptions(apiKey, "post", {
    "Content-Type": "application/json",
  });

  try {
    const response = await client.makeRequest(
      API_ENDPOINTS.ROUTINES,
      options,
      {},
      routineData
    );
    return response;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Submitting routine to API",
      routineTitle: routineData.routine.title,
    });
  }
}

/**
 * Updates an existing routine from sheet data
 * @param {string} routineId - Routine ID to update
 * @param {Object} routineData - The routine payload to send
 * @returns {Promise<Object>} Parsed response from the API
 */
async function updateRoutineFromSheet(routineId, routineData) {
  const { client, apiKey } = getApiClientAndKey();
  const options = client.createRequestOptions(apiKey, "put", {
    "Content-Type": "application/json",
  });

  try {
    const response = await client.makeRequest(
      `${API_ENDPOINTS.ROUTINES}/${routineId}`,
      options,
      {},
      routineData
    );
    return response;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Updating routine from sheet",
      routineId: routineId,
      routineTitle: routineData.routine.title,
    });
  }
}

/**
 * Finds a routine folder by name
 * @param {string} folderName - Name of the folder to find
 * @returns {Promise<number|null>} Folder ID or null if not found
 */
async function findRoutineFolder(folderName) {
  const { client, apiKey } = getApiClientAndKey();
  const options = client.createRequestOptions(apiKey);

  try {
    const response = await client.makeRequest(
      API_ENDPOINTS.ROUTINE_FOLDERS,
      options,
      { page: 1, page_size: PAGE_SIZE.ROUTINE_FOLDERS }
    );

    const folders = response.routine_folders || [];
    const matchingFolder = folders.find(
      (folder) => folder.title.toLowerCase() === folderName.toLowerCase()
    );

    return matchingFolder ? matchingFolder.id : null;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Finding routine folder",
      folderName: folderName,
    });
  }
}

/**
 * Creates a new routine folder
 * @param {string} folderName - Name for the new folder
 * @returns {Promise<number>} ID of the newly created folder
 */
async function createNewRoutineFolder(folderName) {
  const { client, apiKey } = getApiClientAndKey();
  const options = client.createRequestOptions(apiKey, "post", {
    "Content-Type": "application/json",
  });

  try {
    const payload = { routine_folder: { title: folderName } };
    const response = await client.makeRequest(
      API_ENDPOINTS.ROUTINE_FOLDERS,
      options,
      {},
      payload
    );

    const folderId = response.routine_folder?.id;
    if (!folderId) {
      throw new ApiError(
        "Invalid folder creation response structure",
        0,
        JSON.stringify(response)
      );
    }
    return folderId;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Creating routine folder",
      folderName: folderName,
    });
  }
}

/**
 * Gets or creates a routine folder by name
 * First attempts to find an existing folder, then creates one if not found
 * @param {string} folderName - Name of the folder to get or create
 * @returns {Promise<number|null>} Folder ID if found/created, null if folderName is empty or "(No Folder)"
 */
async function getOrCreateRoutineFolder(folderName) {
  try {
    if (folderName == "(No Folder)" || !folderName) {
      return null;
    }

    const existingFolder = await findRoutineFolder(folderName);
    if (existingFolder) {
      return existingFolder;
    }

    const newFolderId = await createNewRoutineFolder(folderName);
    if (!newFolderId) {
      throw new ApiError("Failed to get ID for created folder");
    }

    return newFolderId;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Managing routine folder",
      folderName: folderName,
    });
  }
}
