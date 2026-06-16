export const customResponse = (message: string, status:boolean, statusCode:number, data?:any) =>{
   return {
		message,
		status,
		statusCode,
		data
	 }
}