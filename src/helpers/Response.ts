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
    message = message || error;
    error = message || error;
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
