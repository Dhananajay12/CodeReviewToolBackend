export const APIConstants = {
  Status: {
    Success: true,
    Failure: false,
  },
  StatusCode: {
    Ok: 200,
    NoContent: 204,
    BadRequest: 400,
    Unauthorized: 401,
    Forbidden: 403,
    NotFound: 404,
    ExistingData: 409,
    InternalServerError: 500,
    ServiceUnavailable: 503,
  },
  Message: {},
  Error: {},
};

export const CustomResponse = (message:string, status:boolean, statusCode:number, data:any, error:any) => {
  if (status === APIConstants.Status.Failure && (!message || !error)) {
    console.log(
      "\u001b[1;31m Error and Message are required for Failure response!",
    );
    message = message || error;
    error = message || error;
    // throw new Error('Error and Message are required for the Failure response!');
  }else if (!data && !message) {
    console.log(
      "\u001b[1;31m Sending Message is required when no data in response!",
    );
    // throw new Error('Sending Message is required when no data in response!');
  }

  return {
    message: message,
    status: status,
    success: status === APIConstants.Status.Failure ? false : true,
    statusCode: statusCode,
    data: data,
    error: error,
  };
};

// Lightweight response envelope (no separate `error` field). Used by the
// newer controllers; on failure the `message` carries the (safe) reason.
export const customResponse = (
  message: string,
  status: boolean,
  statusCode: number,
  data: unknown,
) => {
  return {
    message,
    status,
    success: status,
    statusCode,
    data,
  };
};
