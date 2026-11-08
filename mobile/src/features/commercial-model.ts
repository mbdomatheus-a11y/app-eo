export const sizes = ["PP","P","M","G","GG","XG","EXG",...Array.from({length:21},(_,i)=>String(i+34))];
export const fields = [["category","Categoria"],["product","Produto"],["color","Cor"],["gender","Público"],["size","Tamanho procurado"],["demand","Procura relatada"]] as const;
export type Details = Record<string,string>;
export type CommercialRow = { id:string; store_id:string; person_id:string; store_code:string; store_name:string; region:string; person_name:string; created_at:string; payload:{note?:string;details?:Details;barcode?:string;sizes?:Record<string,number>;status?:string;audio_path?:string;transcript?:string} };
export type CommercialPage = {items:CommercialRow[];total:number;groups:{region:string;total:number}[];top_products?:{region:string;category:string;product:string;color:string;size:string;requests:number}[]};
export const emptyDetails = ():Details => Object.fromEntries(fields.map(([key])=>[key,""]));
export const today = () => new Date().toLocaleDateString("en-CA");
