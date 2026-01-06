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
  const client = getApiClient();
  const apiKey = client.apiKeyManager.getApiKeyFromProperties();
  if (!apiKey) {
    throw new ConfigurationError("API key not found");
  }
  return { client, apiKey };
}

/**
 * Makes an API request with standard error handling
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {Object} payload - Request payload
 * @param {Object} context - Error context
 * @returns {Promise<Object>} API response
 * @private
 */
async function makeRoutineApiRequest(endpoint, method, payload, context) {
  const { client, apiKey } = getApiClientAndKey();
  const options = client.createRequestOptions(apiKey, method, {
    "Content-Type": "application/json",
  });

  try {
    const response = await client.makeRequest(endpoint, options, {}, payload);
    return response;
  } catch (error) {
    throw ErrorHandler.handle(error, context);
  }
}

/**
 * Submits routine to the API
 * @param {Object} routineData - The routine payload to send
 * @returns {Promise<Object>} Parsed response from the API
 */
async function submitRoutine(routineData) {
  return makeRoutineApiRequest(API_ENDPOINTS.ROUTINES, "post", routineData, {
    operation: "Submitting routine to API",
    routineTitle: routineData.routine?.title,
  });
}

/**
 * Updates an existing routine from sheet data
 * @param {string} routineId - Routine ID to update
 * @param {Object} routineData - The routine payload to send
 * @returns {Promise<Object>} Parsed response from the API
 */
async function updateRoutineFromSheet(routineId, routineData) {
  const updatePayload = {
    routine: {
      title: routineData.routine?.title,
      notes: routineData.routine?.notes ?? null,
      exercises: routineData.routine?.exercises ?? [],
    },
  };

  return makeRoutineApiRequest(
    `${API_ENDPOINTS.ROUTINES}/${routineId}`,
    "put",
    updatePayload,
    {
      operation: "Updating routine from sheet",
      routineId,
      routineTitle: routineData.routine?.title,
    }
  );
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

    const folders = response.routine_folders ?? [];
    const normalizedFolderName = folderName.toLowerCase();
    const matchingFolder = folders.find(
      (folder) => folder.title?.toLowerCase() === normalizedFolderName
    );

    return matchingFolder?.id ?? null;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Finding routine folder",
      folderName,
    });
  }
}

/**
 * Finds a routine folder by ID and returns its name
 * @param {number} folderId - ID of the folder to find
 * @returns {Promise<string|null>} Folder name or null if not found
 */
async function findRoutineFolderById(folderId) {
  if (!folderId) return null;

  const { client, apiKey } = getApiClientAndKey();
  const options = client.createRequestOptions(apiKey);

  try {
    let page = 1;
    let hasMore = true;
    const maxPages = ROUTINE_BUILDER_CONFIG.MAX_FOLDER_SEARCH_PAGES;

    while (hasMore && page <= maxPages) {
      const response = await client.makeRequest(
        API_ENDPOINTS.ROUTINE_FOLDERS,
        options,
        { page, page_size: PAGE_SIZE.ROUTINE_FOLDERS }
      );

      const folders = response.routine_folders ?? [];
      if (!folders.length) {
        break;
      }

      const matchingFolder = folders.find((folder) => folder.id == folderId);
      if (matchingFolder) {
        return matchingFolder.title ?? null;
      }

      hasMore = folders.length === PAGE_SIZE.ROUTINE_FOLDERS;
      page++;
    }

    return null;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Finding routine folder by ID",
      folderId,
    });
  }
}

/**
 * Creates a new routine folder
 * @param {string} folderName - Name for the new folder
 * @returns {Promise<number>} ID of the newly created folder
 */
async function createNewRoutineFolder(folderName) {
  const payload = { routine_folder: { title: folderName } };
  const response = await makeRoutineApiRequest(
    API_ENDPOINTS.ROUTINE_FOLDERS,
    "post",
    payload,
    {
      operation: "Creating routine folder",
      folderName,
    }
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
}

/**
 * Gets or creates a routine folder by name
 * First attempts to find an existing folder, then creates one if not found
 * @param {string} folderName - Name of the folder to get or create
 * @returns {Promise<number|null>} Folder ID if found/created, null if folderName is empty or "(No Folder)"
 */
async function getOrCreateRoutineFolder(folderName) {
  if (folderName === "(No Folder)" || !folderName) {
    return null;
  }

  try {
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
      folderName,
    });
  }
}
